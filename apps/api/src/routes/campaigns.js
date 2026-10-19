import { z } from 'zod';
import { prisma } from '@linkpulse/db';
import { requireUser, ownerScope } from '../plugins/auth.js';
import { parse, notFound, conflict } from '../lib/http.js';
import { parsePeriod, timeseries, totals } from '../lib/analytics.js';
import { serializeLink, LINK_INCLUDE } from '../lib/links.js';

const CampaignInput = z.object({
  name: z.string().trim().min(2, 'Give the campaign a name.').max(80),
  description: z.string().trim().max(400).optional().nullable(),
  startsAt: z.string().optional().nullable(),
  endsAt: z.string().optional().nullable(),
  goalClicks: z.number().int().positive().optional().nullable(),
});

const dates = b => ({
  ...b,
  startsAt: b.startsAt ? new Date(b.startsAt) : b.startsAt === null ? null : undefined,
  endsAt: b.endsAt ? new Date(b.endsAt) : b.endsAt === null ? null : undefined,
});

export async function campaignRoutes(app) {
  app.addHook('preHandler', requireUser);

  // Campaign list with link counts and clicks for the selected period.
  app.get('/api/campaigns', async req => {
    const p = parsePeriod(req.query);
    const campaigns = await prisma.campaign.findMany({
      where: { workspaceId: req.user.workspaceId }, orderBy: { createdAt: 'desc' },
      include: { links: { where: ownerScope(req.user), select: { id: true, code: true, clickCount: true, status: true } } },
    });
    const items = await Promise.all(campaigns.map(async c => {
      const ids = c.links.map(l => l.id);
      const t = await totals(ids, p.from, p.to);
      const top = [...c.links].sort((a, b) => b.clickCount - a.clickCount)[0] || null;
      const { links, ...rest } = c;
      return { ...rest, links: links.length, activeLinks: links.filter(l => l.status === 'ACTIVE').length, allTimeClicks: links.reduce((s, l) => s + l.clickCount, 0), ...t, topLink: top && { id: top.id, code: top.code, clicks: top.clickCount } };
    }));
    return { items };
  });

  app.post('/api/campaigns', async (req, reply) => {
    const body = dates(parse(CampaignInput, req.body));
    try {
      const c = await prisma.campaign.create({ data: { ...body, workspaceId: req.user.workspaceId } });
      return reply.code(201).send({ campaign: c });
    } catch (err) {
      if (err.code === 'P2002') throw conflict('A campaign with this name already exists.');
      throw err;
    }
  });

  app.get('/api/campaigns/:id', async req => {
    const c = await prisma.campaign.findFirst({ where: { id: req.params.id, workspaceId: req.user.workspaceId } });
    if (!c) throw notFound('Campaign not found.');
    const p = parsePeriod(req.query);
    const links = await prisma.link.findMany({ where: { campaignId: c.id, ...ownerScope(req.user) }, include: LINK_INCLUDE, orderBy: { clickCount: 'desc' } });
    const ids = links.map(l => l.id);
    const [series, t] = await Promise.all([timeseries(ids, p), totals(ids, p.from, p.to)]);
    return {
      campaign: c, totals: t, series,
      allTimeClicks: links.reduce((s, l) => s + l.clickCount, 0),
      links: links.map(serializeLink),
    };
  });

  app.patch('/api/campaigns/:id', async req => {
    const c = await prisma.campaign.findFirst({ where: { id: req.params.id, workspaceId: req.user.workspaceId } });
    if (!c) throw notFound('Campaign not found.');
    const body = dates(parse(CampaignInput.partial(), req.body));
    return { campaign: await prisma.campaign.update({ where: { id: c.id }, data: body }) };
  });

  app.get('/api/tags', async req => {
    const tags = await prisma.tag.findMany({ where: { workspaceId: req.user.workspaceId }, orderBy: { name: 'asc' }, include: { _count: { select: { links: true } } } });
    return { items: tags.map(t => ({ id: t.id, name: t.name, color: t.color, links: t._count.links })) };
  });

  app.get('/api/folders', async req => ({ items: await prisma.folder.findMany({ where: { workspaceId: req.user.workspaceId }, orderBy: { name: 'asc' } }) }));
  app.post('/api/folders', async (req, reply) => {
    const { name } = parse(z.object({ name: z.string().trim().min(1).max(60) }), req.body);
    const f = await prisma.folder.upsert({ where: { workspaceId_name: { workspaceId: req.user.workspaceId, name } }, update: {}, create: { workspaceId: req.user.workspaceId, name } });
    return reply.code(201).send({ folder: f });
  });
}
