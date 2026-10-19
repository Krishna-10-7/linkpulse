import { prisma } from '@linkpulse/db';
import { redis, keys } from './redis.js';

// Redirect lookups read Redis first and only fall back to Postgres on a miss.
// Any change to a link (edit, pause, admin disable) must call invalidateLink().

const TTL_SECONDS = 600;
const MISS_TTL_SECONDS = 30;
const MISS = '__none__';

const FIELDS = {
  id: true, code: true, codeLower: true, destination: true, title: true, status: true, startsAt: true,
  expiresAt: true, clickLimit: true, clickCount: true, passwordHash: true, flagged: true, ownerId: true,
  createdAt: true, disabledReason: true,
  rules: { select: { type: true, value: true, destination: true, priority: true } },
};

export async function getLinkByCode(codeLower) {
  const r = redis();
  const cached = await r.get(keys.link(codeLower)).catch(() => null);
  if (cached === MISS) return null;
  if (cached) return JSON.parse(cached);

  const link = await prisma.link.findUnique({ where: { codeLower }, select: FIELDS });
  if (!link) {
    await r.set(keys.link(codeLower), MISS, 'EX', MISS_TTL_SECONDS).catch(() => {});
    return null;
  }
  await r.set(keys.link(codeLower), JSON.stringify(link), 'EX', TTL_SECONDS).catch(() => {});
  // Seed the click-cap counter from the database the first time we see the link.
  if (link.clickLimit != null) await r.set(keys.cap(link.id), link.clickCount, 'NX').catch(() => {});
  return link;
}

export async function invalidateLink(codeLower) {
  await redis().del(keys.link(codeLower)).catch(() => {});
}
