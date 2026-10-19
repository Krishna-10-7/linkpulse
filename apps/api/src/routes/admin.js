import { z } from 'zod';
import { prisma } from '@linkpulse/db';
import { invalidateLink } from '@linkpulse/runtime';
import { requireAdmin } from '../plugins/auth.js';
import { parse, notFound, badRequest } from '../lib/http.js';
import { serializeLink, LINK_INCLUDE } from '../lib/links.js';
import { audit } from '../lib/audit.js';
import { resetBlockCache } from '../lib/validation.js';
import { domainOf } from '@linkpulse/core';
import { parsePeriod, totals } from '../lib/analytics.js';

const Search = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED', 'DISABLED']).optional(),
  flagged: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export async function adminRoutes(app) {
  app.addHook('preHandler', requireAdmin);

  app.get('/api/admin/stats', async req => {
    const p = parsePeriod(req.query);
    const [users, links, active, disabled, flagged, openReports, blocked] = await Promise.all([
      prisma.user.count(), prisma.link.count(), prisma.link.count({ where: { status: 'ACTIVE' } }),
      prisma.link.count({ where: { status: 'DISABLED' } }), prisma.link.count({ where: { flagged: true } }),
      prisma.abuseReport.count({ where: { status: 'OPEN' } }), prisma.blockedDomain.count(),
    ]);
    const ids = (await prisma.link.findMany({ select: { id: true } })).map(l => l.id);
    return { users, links, active, disabled, flagged, openReports, blockedDomains: blocked, ...(await totals(ids, p.from, p.to)) };
  });

  // Search any link on the platform, by code, destination, title or owner email.
  app.get('/api/admin/links', async req => {
    const q = parse(Search, req.query);
    const where = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.flagged ? { flagged: q.flagged === 'true' } : {}),
      ...(q.q ? { OR: [
        { codeLower: { contains: q.q.toLowerCase() } }, { destination: { contains: q.q, mode: 'insensitive' } },
        { title: { contains: q.q, mode: 'insensitive' } }, { owner: { email: { contains: q.q.toLowerCase() } } },
      ] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.link.findMany({ where, include: { ...LINK_INCLUDE, _count: { select: { reports: { where: { status: 'OPEN' } } } } }, orderBy: [{ flagged: 'desc' }, { createdAt: 'desc' }], skip: (q.page - 1) * 25, take: 25 }),
      prisma.link.count({ where }),
    ]);
    return { items: items.map(l => ({ ...serializeLink(l), openReports: l._count.reports })), total, page: q.page };
  });

  // Takedown: the DB update and the cache purge happen together, so the very next visit gets a 410.
  app.post('/api/admin/links/:id/disable', async req => {
    const { reason } = parse(z.object({ reason: z.string().trim().min(3, 'Give a reason.').max(300) }), req.body);
    const link = await prisma.link.findUnique({ where: { id: req.params.id } });
    if (!link) throw notFound('Link not found.');
    const updated = await prisma.link.update({
      where: { id: link.id }, include: LINK_INCLUDE,
      data: { status: 'DISABLED', disabledReason: reason, disabledAt: new Date(), disabledById: req.user.id, flagged: false },
    });
    await invalidateLink(link.codeLower);
    await prisma.abuseReport.updateMany({ where: { linkId: link.id, status: 'OPEN' }, data: { status: 'RESOLVED' } });
    await audit(req.user.id, 'link.disable', 'link', link.id, { before: link.status, reason, code: link.code });
    return { link: serializeLink(updated) };
  });

  app.post('/api/admin/links/:id/restore', async req => {
    const link = await prisma.link.findUnique({ where: { id: req.params.id } });
    if (!link) throw notFound('Link not found.');
    if (link.status !== 'DISABLED' && !link.flagged) throw badRequest('This link is not disabled or flagged.');
    const updated = await prisma.link.update({
      where: { id: link.id }, include: LINK_INCLUDE,
      data: { status: 'ACTIVE', disabledReason: null, disabledAt: null, disabledById: null, flagged: false },
    });
    await invalidateLink(link.codeLower);
    await audit(req.user.id, 'link.restore', 'link', link.id, { before: link.status, code: link.code });
    return { link: serializeLink(updated) };
  });

  // Domain blocklist. Adding a domain pauses every active link that points at it
  // and flags it for review, so nothing keeps redirecting to a known-bad site.
  app.get('/api/admin/blocklist', async () => ({ items: await prisma.blockedDomain.findMany({ orderBy: { createdAt: 'desc' } }) }));

  app.post('/api/admin/blocklist', async (req, reply) => {
    const body = parse(z.object({ domain: z.string().trim().toLowerCase().min(3).max(253), reason: z.string().trim().max(300).optional() }), req.body);
    const domain = body.domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw badRequest('Enter a domain like example.com.');
    const entry = await prisma.blockedDomain.upsert({ where: { domain }, update: { reason: body.reason }, create: { domain, reason: body.reason, addedById: req.user.id } });
    resetBlockCache();

    const affected = await prisma.link.findMany({
      where: { status: 'ACTIVE', OR: [{ destination: { contains: `://${domain}`, mode: 'insensitive' } }, { destination: { contains: `.${domain}`, mode: 'insensitive' } }] },
      select: { id: true, codeLower: true, destination: true },
    });
    const hits = affected.filter(l => { const h = domainOf(l.destination); return h === domain || h?.endsWith('.' + domain); });
    if (hits.length) {
      await prisma.link.updateMany({ where: { id: { in: hits.map(l => l.id) } }, data: { status: 'PAUSED', flagged: true, disabledReason: `Destination ${domain} is on the blocklist` } });
      await Promise.all(hits.map(l => invalidateLink(l.codeLower)));
    }
    await audit(req.user.id, 'blocklist.add', 'domain', entry.id, { domain, reason: body.reason, pausedLinks: hits.length });
    return reply.code(201).send({ entry, pausedLinks: hits.length });
  });

  app.delete('/api/admin/blocklist/:id', async req => {
    const entry = await prisma.blockedDomain.delete({ where: { id: req.params.id } }).catch(() => null);
    if (!entry) throw notFound('Not on the blocklist.');
    resetBlockCache();
    await audit(req.user.id, 'blocklist.remove', 'domain', entry.id, { domain: entry.domain });
    return { ok: true };
  });

  app.get('/api/admin/users', async () => {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, email: true, name: true, role: true, createdAt: true, _count: { select: { links: true } } } });
    return { items: users.map(({ _count, ...u }) => ({ ...u, links: _count.links })) };
  });

  app.patch('/api/admin/users/:id', async req => {
    const { role } = parse(z.object({ role: z.enum(['USER', 'ADMIN']) }), req.body);
    if (req.params.id === req.user.id) throw badRequest('You cannot change your own role.');
    const u = await prisma.user.update({ where: { id: req.params.id }, data: { role }, select: { id: true, email: true, role: true } });
    await audit(req.user.id, 'user.role', 'user', u.id, { role });
    return { user: u };
  });

  app.get('/api/admin/audit', async () => {
    const items = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    const actors = await prisma.user.findMany({ where: { id: { in: [...new Set(items.map(i => i.actorId).filter(Boolean))] } }, select: { id: true, email: true } });
    const byId = new Map(actors.map(a => [a.id, a.email]));
    return { items: items.map(i => ({ ...i, actor: byId.get(i.actorId) || 'system' })) };
  });
}
