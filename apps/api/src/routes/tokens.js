import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@linkpulse/db';
import { requireUser, hashToken } from '../plugins/auth.js';
import { parse, notFound, badRequest } from '../lib/http.js';

// Personal access tokens for the browser extension. The plain token is shown once;
// only its SHA-256 hash is stored.

const MAX_TOKENS = 10;

export async function tokenRoutes(app) {
  app.addHook('preHandler', requireUser);

  app.get('/api/tokens', async req => ({
    items: await prisma.apiToken.findMany({
      where: { userId: req.user.id }, orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true },
    }),
  }));

  app.post('/api/tokens', async (req, reply) => {
    const { name } = parse(z.object({ name: z.string().trim().min(1, 'Name the token.').max(60) }), req.body);
    if (await prisma.apiToken.count({ where: { userId: req.user.id } }) >= MAX_TOKENS) throw badRequest(`You can have at most ${MAX_TOKENS} tokens.`);
    const token = `lp_${randomBytes(24).toString('base64url')}`;
    const row = await prisma.apiToken.create({
      data: { userId: req.user.id, name, tokenHash: hashToken(token), prefix: token.slice(0, 7) },
      select: { id: true, name: true, prefix: true, createdAt: true },
    });
    return reply.code(201).send({ token, item: row });
  });

  app.delete('/api/tokens/:id', async req => {
    const res = await prisma.apiToken.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
    if (!res.count) throw notFound('Token not found.');
    return { ok: true };
  });
}
