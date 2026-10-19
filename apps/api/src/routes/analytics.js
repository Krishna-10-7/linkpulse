import { prisma } from '@linkpulse/db';
import { requireUser, ownerScope } from '../plugins/auth.js';
import { notFound } from '../lib/http.js';
import { parsePeriod, timeseries, totals, breakdown, change } from '../lib/analytics.js';

export async function analyticsRoutes(app) {
  app.addHook('preHandler', requireUser);

  // Per-link analytics. Disabled, expired and archived links keep their history here.
  app.get('/api/links/:id/analytics', async req => {
    const link = await prisma.link.findFirst({ where: { id: req.params.id, ...ownerScope(req.user) }, select: { id: true } });
    if (!link) throw notFound('Link not found.');
    const p = parsePeriod(req.query);
    const ids = [link.id];
    const [series, now, before, sources, devices, browsers, os, countries, referrers, recent] = await Promise.all([
      timeseries(ids, p),
      totals(ids, p.from, p.to),
      totals(ids, p.prevFrom, p.prevTo),
      breakdown(ids, p, 'source'),
      breakdown(ids, p, 'deviceType'),
      breakdown(ids, p, 'browser'),
      breakdown(ids, p, 'os'),
      breakdown(ids, p, 'country', 12),
      breakdown(ids, p, 'referrerDomain'),
      prisma.clickEvent.findMany({
        where: { linkId: link.id }, orderBy: { ts: 'desc' }, take: 15,
        select: { ts: true, country: true, city: true, deviceType: true, browser: true, os: true, source: true, isBot: true, isUnique: true },
      }),
    ]);
    return {
      period: { from: p.from, to: p.to, hourly: p.hourly },
      totals: { ...now, change: { clicks: change(now.clicks, before.clicks), uniques: change(now.uniques, before.uniques) } },
      series, sources, devices, browsers, os, countries,
      referrers: referrers.filter(r => r.key !== 'Unknown'),
      recent,
    };
  });
}
