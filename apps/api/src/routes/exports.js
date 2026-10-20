import { prisma } from '@linkpulse/db';
import { toCsv } from '@linkpulse/core';
import { shortUrl } from '@linkpulse/runtime';
import { requireUser, ownerScope } from '../plugins/auth.js';
import { notFound } from '../lib/http.js';
import { parsePeriod } from '../lib/analytics.js';

// CSV exports for reporting outside the dashboard. Same owner scoping as every other query.

const MAX_LINKS = 5000;
const MAX_CLICKS = 50000;
const iso = d => (d ? new Date(d).toISOString() : '');
const stamp = () => new Date().toISOString().slice(0, 10);

function send(reply, filename, csv) {
  return reply.type('text/csv; charset=utf-8').header('content-disposition', `attachment; filename="${filename}"`).send('﻿' + csv);
}

export async function exportRoutes(app) {
  app.addHook('preHandler', requireUser);

  // All links matching the list filters (status, campaign, tag, search).
  app.get('/api/links/export.csv', async (req, reply) => {
    const { q, status, campaignId, tag } = req.query;
    const where = {
      ...ownerScope(req.user),
      ...(status ? { status } : { status: { not: 'ARCHIVED' } }),
      ...(campaignId ? { campaignId } : {}),
      ...(tag ? { tags: { some: { tag: { name: String(tag).toLowerCase() } } } } : {}),
      ...(q ? { OR: [{ codeLower: { contains: String(q).toLowerCase() } }, { destination: { contains: String(q), mode: 'insensitive' } }, { title: { contains: String(q), mode: 'insensitive' } }] } : {}),
    };
    const links = await prisma.link.findMany({
      where, orderBy: { createdAt: 'desc' }, take: MAX_LINKS,
      include: { campaign: { select: { name: true } }, tags: { select: { tag: { select: { name: true } } } } },
    });
    const rows = links.map(l => ({
      short_url: shortUrl(l.code), code: l.code, destination: l.destination, title: l.title || '', status: l.status,
      campaign: l.campaign?.name || '', tags: l.tags.map(t => t.tag.name).join(';'), clicks: l.clickCount,
      click_limit: l.clickLimit ?? '', password: l.passwordHash ? 'yes' : 'no', starts_at: iso(l.startsAt), expires_at: iso(l.expiresAt), created_at: iso(l.createdAt),
    }));
    return send(reply, `linkpulse-links-${stamp()}.csv`, toCsv(rows, Object.keys(rows[0] || { short_url: '' })));
  });

  // Every click on one link in the period, bots included and marked.
  app.get('/api/links/:id/clicks.csv', async (req, reply) => {
    const link = await prisma.link.findFirst({ where: { id: req.params.id, ...ownerScope(req.user) }, select: { id: true, code: true } });
    if (!link) throw notFound('Link not found.');
    const p = parsePeriod(req.query);
    const clicks = await prisma.clickEvent.findMany({
      where: { linkId: link.id, ts: { gte: p.from, lte: p.to } }, orderBy: { ts: 'asc' }, take: MAX_CLICKS,
      select: { ts: true, country: true, city: true, deviceType: true, os: true, browser: true, source: true, referrerDomain: true, isBot: true, isUnique: true, viaQr: true },
    });
    const columns = ['time', 'country', 'city', 'device', 'os', 'browser', 'source', 'referrer', 'bot', 'unique', 'qr'];
    const rows = clicks.map(c => ({
      time: iso(c.ts), country: c.country || '', city: c.city || '', device: c.deviceType, os: c.os || '', browser: c.browser || '',
      source: c.source, referrer: c.referrerDomain || '', bot: c.isBot ? 'yes' : 'no', unique: c.isUnique ? 'yes' : 'no', qr: c.viaQr ? 'yes' : 'no',
    }));
    return send(reply, `linkpulse-${link.code}-clicks-${stamp()}.csv`, toCsv(rows, columns));
  });
}
