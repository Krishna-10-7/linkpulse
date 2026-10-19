import { prisma } from '@linkpulse/db';
import { requireUser, ownerScope } from '../plugins/auth.js';
import { parsePeriod, timeseries, totals, breakdown, change } from '../lib/analytics.js';
import { shortUrl } from '@linkpulse/runtime';

const DAY = 86400000;

/** Alerts the owner should act on: near cap, expiring, broken destination, disabled, flagged, spikes. */
async function alerts(links) {
  const now = Date.now();
  const out = [];
  for (const l of links) {
    if (l.status === 'DISABLED') out.push({ kind: 'disabled', level: 'bad', linkId: l.id, code: l.code, message: `${l.code} was disabled by an admin${l.disabledReason ? `: ${l.disabledReason}` : ''}.` });
    else if (l.flagged) out.push({ kind: 'flagged', level: 'bad', linkId: l.id, code: l.code, message: `${l.code} is paused for review after abuse reports.` });
    if (l.status !== 'ACTIVE') continue;
    if (l.clickLimit && l.clickCount >= l.clickLimit * 0.9) out.push({ kind: 'cap', level: 'warn', linkId: l.id, code: l.code, message: `${l.code} is at ${Math.round((l.clickCount / l.clickLimit) * 100)}% of its click limit.` });
    if (l.expiresAt && new Date(l.expiresAt) - now < 7 * DAY && new Date(l.expiresAt) > now) out.push({ kind: 'expiring', level: 'warn', linkId: l.id, code: l.code, message: `${l.code} expires on ${new Date(l.expiresAt).toDateString()}.` });
    if (l.healthStatus && l.healthStatus >= 400) out.push({ kind: 'broken', level: 'bad', linkId: l.id, code: l.code, message: `${l.code}'s destination returns HTTP ${l.healthStatus}.` });
  }
  // Spike: today's human clicks are more than 3× the daily average of the previous week (and at least 50).
  const ids = links.filter(l => l.status === 'ACTIVE').map(l => l.id);
  if (ids.length) {
    const today = new Date(new Date().toISOString().slice(0, 10));
    const rows = await prisma.clickDaily.findMany({ where: { linkId: { in: ids }, day: { gte: new Date(today - 7 * DAY) } }, select: { linkId: true, day: true, clicks: true } });
    const by = new Map();
    for (const r of rows) {
      const e = by.get(r.linkId) || { today: 0, week: 0 };
      if (r.day.getTime() === today.getTime()) e.today += r.clicks; else e.week += r.clicks;
      by.set(r.linkId, e);
    }
    for (const [linkId, e] of by) {
      if (e.today >= 50 && e.today > 3 * (e.week / 7)) {
        const l = links.find(x => x.id === linkId);
        out.push({ kind: 'spike', level: 'info', linkId, code: l.code, message: `${l.code} has ${e.today} clicks today — over 3× its usual day.` });
      }
    }
  }
  const order = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]).slice(0, 12);
}

export async function dashboardRoutes(app) {
  app.addHook('preHandler', requireUser);

  // scope=platform lets admins see everything; everyone else sees their own links.
  app.get('/api/dashboard', async req => {
    const p = parsePeriod(req.query);
    const platform = req.user.role === 'ADMIN' && req.query.scope === 'platform';
    const where = { ...(platform ? {} : ownerScope(req.user.role === 'ADMIN' ? { ...req.user, role: 'USER' } : req.user)), ...(req.query.campaignId ? { campaignId: req.query.campaignId } : {}) };
    const links = await prisma.link.findMany({
      where, select: { id: true, code: true, title: true, destination: true, status: true, clickCount: true, clickLimit: true, expiresAt: true, healthStatus: true, flagged: true, disabledReason: true, campaignId: true, campaign: { select: { name: true } } },
    });
    const ids = links.map(l => l.id);
    const [now, before, series, sources, devices, browsers, countries, topRows] = await Promise.all([
      totals(ids, p.from, p.to), totals(ids, p.prevFrom, p.prevTo), timeseries(ids, p),
      breakdown(ids, p, 'source'), breakdown(ids, p, 'deviceType'), breakdown(ids, p, 'browser', 6), breakdown(ids, p, 'country', 8),
      ids.length ? prisma.clickEvent.groupBy({ by: ['linkId'], where: { linkId: { in: ids }, ts: { gte: p.from, lte: p.to }, isBot: false }, _count: { _all: true }, orderBy: { _count: { linkId: 'desc' } }, take: 8 }) : [],
    ]);
    const byId = new Map(links.map(l => [l.id, l]));

    const campaigns = new Map();
    const periodClicks = new Map(topRows.map(r => [r.linkId, r._count._all]));
    if (ids.length) {
      const all = await prisma.clickEvent.groupBy({ by: ['linkId'], where: { linkId: { in: ids }, ts: { gte: p.from, lte: p.to }, isBot: false }, _count: { _all: true } });
      for (const r of all) periodClicks.set(r.linkId, r._count._all);
    }
    for (const l of links) {
      if (!l.campaignId) continue;
      const c = campaigns.get(l.campaignId) || { id: l.campaignId, name: l.campaign.name, links: 0, clicks: 0, top: null };
      c.links++;
      const n = periodClicks.get(l.id) || 0;
      c.clicks += n;
      if (!c.top || n > c.top.clicks) c.top = { code: l.code, clicks: n };
      campaigns.set(l.campaignId, c);
    }

    return {
      scope: platform ? 'platform' : 'mine',
      period: { from: p.from, to: p.to, hourly: p.hourly },
      kpis: {
        links: links.length, activeLinks: links.filter(l => l.status === 'ACTIVE').length,
        clicks: now.clicks, uniques: now.uniques, bots: now.bots, qr: now.qr,
        change: { clicks: change(now.clicks, before.clicks), uniques: change(now.uniques, before.uniques), bots: change(now.bots, before.bots) },
      },
      series, sources, devices, browsers, countries,
      campaigns: [...campaigns.values()].sort((a, b) => b.clicks - a.clicks),
      topLinks: topRows.map(r => { const l = byId.get(r.linkId); return { id: l.id, code: l.code, title: l.title, shortUrl: shortUrl(l.code), destination: l.destination, clicks: r._count._all, status: l.status }; }),
      alerts: await alerts(links),
    };
  });
}
