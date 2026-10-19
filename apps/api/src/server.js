import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import { config, redis } from '@linkpulse/runtime';
import { prisma } from '@linkpulse/db';
import { errorHandler } from './lib/http.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';

// Management API: auth, roles, links, campaigns, analytics, imports and admin tools.

const app = Fastify({ logger: { level: config.production ? 'warn' : 'info' }, trustProxy: true, bodyLimit: 4 * 1024 * 1024 });

app.setErrorHandler(errorHandler);
await app.register(cookie);
await app.register(formbody);
await authPlugin(app); // applied to the root instance so every route sees req.user

app.get('/api/health', async () => {
  const [db, cache] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true, () => false),
    redis().ping().then(p => p === 'PONG', () => false),
  ]);
  return { ok: db && cache, db, redis: cache };
});

await app.register(authRoutes);

app.listen({ port: config.apiPort, host: '127.0.0.1' }).then(() => app.log.info(`api on :${config.apiPort}`));
