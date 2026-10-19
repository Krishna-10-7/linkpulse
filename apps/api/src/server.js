import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import { config, redis } from '@linkpulse/runtime';
import { prisma } from '@linkpulse/db';
import { errorHandler } from './lib/http.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { linkRoutes } from './routes/links.js';
import { analyticsRoutes } from './routes/analytics.js';
import { campaignRoutes } from './routes/campaigns.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { streamRoutes } from './routes/stream.js';
import { adminRoutes } from './routes/admin.js';
import { reportRoutes } from './routes/reports.js';
import { qrRoutes } from './routes/qr.js';

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
await app.register(linkRoutes);
await app.register(analyticsRoutes);
await app.register(campaignRoutes);
await app.register(dashboardRoutes);
await app.register(streamRoutes);
await app.register(adminRoutes);
await app.register(reportRoutes);
await app.register(qrRoutes);

app.listen({ port: config.apiPort, host: '127.0.0.1' }).then(() => app.log.info(`api on :${config.apiPort}`));
