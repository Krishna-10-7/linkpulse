import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@linkpulse/db';
import { validateAlias, suggestAliases } from '@linkpulse/core';
import { invalidateLink } from '@linkpulse/runtime';
import { parse, badRequest, notFound, forbidden, conflict } from '../lib/http.js';
import { requireUser, ownerScope } from '../plugins/auth.js';
import { enforce } from '../lib/limit.js';
import { validateLinkInput, aliasTaken } from '../lib/validation.js';
import { createLink, serializeLink, LINK_INCLUDE, upsertTags, resolveCampaign } from '../lib/links.js';

const Rule = z.object({
  type: z.enum(['device', 'os', 'country']),
  value: z.string().trim().min(1).max(40),
  destination: z.string().trim().min(1).max(2048),
  priority: z.number().int().min(0).max(1000).optional(),
});
const dateish = z.union([z.string().datetime({ offset: true }), z.string().regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+)?$/)]).nullable().optional();

const LinkInput = z.object({
  destination: z.string().trim().min(1, 'Enter a destination URL.').max(2048),
  alias: z.string().trim().max(30).optional().nullable().transform(v => v || null),
  title: z.string().trim().max(200).optional().nullable(),
  campaignId: z.string().optional().nullable(),
  campaignName: z.string().trim().max(80).optional().nullable(),
  folderId: z.string().optional().nullable(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  startsAt: dateish,
  expiresAt: dateish,
  clickLimit: z.number().int().positive().max(100_000_000).optional().nullable(),
  password: z.string().min(4, 'Use at least 4 characters.').max(100).optional().nullable(),
  utm: z.record(z.string().max(100)).optional().nullable(),
  rules: z.array(Rule).max(10).optional(),
});

const LinkPatch = LinkInput.partial().extend({
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
  removePassword: z.boolean().optional(),
});

const ListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED', 'DISABLED']).optional(),
  campaignId: z.string().optional(),
  tag: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

async function findOwned(user, id) {
  const link = await prisma.link.findFirst({ where: { id, ...ownerScope(user) }, include: LINK_INCLUDE });
  if (!link) throw notFound('Link not found.');
  return link;
}

export async function linkRoutes(app) {
  app.addHook('preHandler', requireUser);

  // Dry run used by step 2 of the wizard: errors block publishing, warnings need a look.
  app.post('/api/links/validate', async req => {
    const body = parse(LinkInput.partial({ destination: true }).extend({ destination: z.string().default('') }), req.body);
    return validateLinkInput(body, { user: req.user });
  });

  app.get('/api/aliases/:alias', async req => {
    const a = validateAlias(req.params.alias);
    if (a.errors.length) return { available: false, errors: a.errors, suggestions: [] };
    const taken = await aliasTaken(a.alias.toLowerCase());
    return { available: !taken, errors: [], suggestions: taken ? await suggestAliases(a.alias, aliasTaken) : [] };
  });

  app.post('/api/links', async (req, reply) => {
    await enforce('createLink', req.user.id);
    const body = parse(LinkInput, req.body);
    const check = await validateLinkInput(body, { user: req.user });
    if (!check.ok) throw badRequest('This link cannot be published yet.', { errors: check.errors, warnings: check.warnings, suggestions: check.suggestions });
    for (const r of body.rules || []) {
      const rc = await validateLinkInput({ destination: r.destination }, { network: false });
      if (!rc.ok) throw badRequest(`Targeting rule for ${r.value}: ${rc.errors[0].message}`);
      r.destination = rc.url;
    }
    try {
      const link = await createLink(req.user, { ...body, destination: check.url, title: body.title || check.title });
      return reply.code(201).send({ link: serializeLink(link), warnings: check.warnings });
    } catch (err) {
      if (err.code === 'P2002') throw conflict('That alias was just taken.', { suggestions: await suggestAliases(body.alias, aliasTaken) });
      throw err;
    }
  });

  app.get('/api/links', async req => {
    const q = parse(ListQuery, req.query);
    const where = {
      ...ownerScope(req.user),
      ...(q.status ? { status: q.status } : { status: { not: 'ARCHIVED' } }),
      ...(q.campaignId ? { campaignId: q.campaignId } : {}),
      ...(q.tag ? { tags: { some: { tag: { name: q.tag.toLowerCase() } } } } : {}),
      ...(q.q ? { OR: [{ codeLower: { contains: q.q.toLowerCase() } }, { destination: { contains: q.q, mode: 'insensitive' } }, { title: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.link.findMany({ where, include: LINK_INCLUDE, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.link.count({ where }),
    ]);
    return { items: items.map(serializeLink), total, page: q.page, pageSize: q.pageSize };
  });

  app.get('/api/links/:id', async req => ({ link: serializeLink(await findOwned(req.user, req.params.id)) }));

  app.patch('/api/links/:id', async req => {
    const link = await findOwned(req.user, req.params.id);
    if (link.status === 'DISABLED' && req.user.role !== 'ADMIN') throw forbidden('An admin disabled this link. It can only be restored by an admin.');
    const body = parse(LinkPatch, req.body);
    const data = {};

    if (body.destination !== undefined || body.alias !== undefined || body.expiresAt !== undefined || body.clickLimit !== undefined) {
      const check = await validateLinkInput({
        destination: body.destination ?? link.destination, alias: body.alias && body.alias !== link.code ? body.alias : null,
        expiresAt: body.expiresAt, startsAt: body.startsAt, clickLimit: body.clickLimit,
      }, { user: req.user, excludeLinkId: link.id, network: body.destination !== undefined && body.destination !== link.destination });
      if (!check.ok) throw badRequest('Some changes need attention.', { errors: check.errors, warnings: check.warnings, suggestions: check.suggestions });
      if (body.destination !== undefined) data.destination = check.url;
      if (body.alias && body.alias !== link.code) { data.code = body.alias; data.codeLower = body.alias.toLowerCase(); }
    }
    for (const k of ['title', 'startsAt', 'expiresAt', 'clickLimit', 'status', 'folderId']) {
      if (body[k] !== undefined) data[k] = (k === 'startsAt' || k === 'expiresAt') && body[k] ? new Date(body[k]) : body[k];
    }
    if (body.campaignId !== undefined || body.campaignName !== undefined) data.campaignId = await resolveCampaign(link.workspaceId, body);
    if (body.password) data.passwordHash = await bcrypt.hash(body.password, 10);
    if (body.removePassword) data.passwordHash = null;

    const updated = await prisma.$transaction(async tx => {
      if (body.tags) {
        const tags = await upsertTags(link.workspaceId, body.tags);
        await tx.linkTag.deleteMany({ where: { linkId: link.id } });
        if (tags.length) await tx.linkTag.createMany({ data: tags.map(t => ({ linkId: link.id, tagId: t.id })) });
      }
      if (body.rules) {
        await tx.redirectRule.deleteMany({ where: { linkId: link.id } });
        if (body.rules.length) await tx.redirectRule.createMany({ data: body.rules.map((r, i) => ({ linkId: link.id, type: r.type, value: r.value, destination: r.destination, priority: r.priority ?? (100 - i) })) });
      }
      return tx.link.update({ where: { id: link.id }, data, include: LINK_INCLUDE });
    });
    await invalidateLink(link.codeLower);
    if (updated.codeLower !== link.codeLower) await invalidateLink(updated.codeLower);
    return { link: serializeLink(updated) };
  });

  // Links are never hard-deleted: archiving keeps their analytics traceable in reports.
  app.delete('/api/links/:id', async req => {
    const link = await findOwned(req.user, req.params.id);
    if (link.status === 'DISABLED') throw forbidden('Disabled links stay disabled for the audit trail.');
    const updated = await prisma.link.update({ where: { id: link.id }, data: { status: 'ARCHIVED' }, include: LINK_INCLUDE });
    await invalidateLink(link.codeLower);
    return { link: serializeLink(updated) };
  });
}
