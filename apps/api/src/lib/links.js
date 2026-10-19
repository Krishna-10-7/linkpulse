import bcrypt from 'bcryptjs';
import { prisma } from '@linkpulse/db';
import { generateUniqueCode, isReserved, applyUtm } from '@linkpulse/core';
import { config, shortUrl, invalidateLink } from '@linkpulse/runtime';
import { aliasTaken } from './validation.js';

export const LINK_INCLUDE = {
  campaign: { select: { id: true, name: true } },
  folder: { select: { id: true, name: true } },
  tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
  rules: { select: { id: true, type: true, value: true, destination: true, priority: true }, orderBy: { priority: 'desc' } },
  owner: { select: { id: true, name: true, email: true } },
};

/** The JSON shape the dashboard and extension receive. Never includes the password hash. */
export function serializeLink(l) {
  const { passwordHash, tags, ...rest } = l;
  return {
    ...rest,
    hasPassword: !!passwordHash,
    tags: (tags || []).map(t => t.tag),
    shortUrl: shortUrl(l.code),
    previewUrl: shortUrl(l.code) + '+',
    qrUrl: `${config.basePath}/api/links/${l.id}/qr.svg`,
  };
}

export async function upsertTags(workspaceId, names = []) {
  const clean = [...new Set(names.map(n => String(n).trim().toLowerCase().replace(/^#/, '')).filter(Boolean))].slice(0, 10);
  const tags = [];
  for (const name of clean) {
    tags.push(await prisma.tag.upsert({ where: { workspaceId_name: { workspaceId, name } }, update: {}, create: { workspaceId, name } }));
  }
  return tags;
}

export async function resolveCampaign(workspaceId, { campaignId, campaignName }) {
  if (campaignId) {
    const c = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId } });
    return c?.id ?? null;
  }
  const name = String(campaignName || '').trim();
  if (!name) return null;
  const c = await prisma.campaign.upsert({ where: { workspaceId_name: { workspaceId, name } }, update: {}, create: { workspaceId, name } });
  return c.id;
}

/** Create a link from already-validated input. Used by the API, CSV import and extension. */
export async function createLink(user, input) {
  const workspaceId = user.workspaceId;
  const campaignId = await resolveCampaign(workspaceId, input);
  let destination = input.destination;
  if (input.utm && Object.values(input.utm).some(Boolean)) {
    const campaign = campaignId ? await prisma.campaign.findUnique({ where: { id: campaignId } }) : null;
    destination = applyUtm(destination, input.utm, { campaignName: campaign?.name });
  }
  const tags = await upsertTags(workspaceId, input.tags);
  const data = {
    destination, title: input.title || null, ownerId: user.id, workspaceId, campaignId, folderId: input.folderId || null,
    startsAt: input.startsAt ? new Date(input.startsAt) : null, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    clickLimit: input.clickLimit ?? null, passwordHash: input.password ? await bcrypt.hash(input.password, 10) : null,
    utm: input.utm || undefined,
    tags: { create: tags.map(t => ({ tagId: t.id })) },
    rules: { create: (input.rules || []).map((r, i) => ({ type: r.type, value: r.value, destination: r.destination, priority: r.priority ?? (100 - i) })) },
  };

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = input.alias || await generateUniqueCode(aliasTaken, { isReserved });
    try {
      const link = await prisma.link.create({ data: { ...data, code, codeLower: code.toLowerCase() }, include: LINK_INCLUDE });
      await invalidateLink(link.codeLower); // clear any cached "not found" for this code
      return link;
    } catch (err) {
      // P2002: unique violation. A custom alias that races another user is a real conflict; a random code just retries.
      if (err.code === 'P2002' && !input.alias) continue;
      throw err;
    }
  }
  throw new Error('Could not allocate a short code');
}
