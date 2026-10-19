import { prisma } from '@linkpulse/db';

// Link health monitor: every few minutes, re-check a batch of active destinations
// that have not been checked recently and store the HTTP status. The dashboard
// raises a "destination broken" alert for anything at 400 or above.

const EVERY_MS = Number(process.env.HEALTH_INTERVAL_MIN || 10) * 60_000;
const STALE_MS = 6 * 3600_000;
const BATCH = 25;

async function status(url) {
  for (const method of ['HEAD', 'GET']) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      // Redirects are not followed: a 3xx means the destination answered.
      const res = await fetch(url, { method, redirect: 'manual', signal: ctrl.signal, headers: { 'user-agent': 'LinkPulseBot/1.0 (+link health check)' } });
      if (method === 'HEAD' && (res.status === 405 || res.status === 501)) continue;
      return res.status;
    } catch { if (method === 'GET') return 599; } finally { clearTimeout(t); }
  }
  return 599; // network error or timeout
}

export async function checkBatch() {
  const links = await prisma.link.findMany({
    where: { status: 'ACTIVE', OR: [{ healthCheckAt: null }, { healthCheckAt: { lt: new Date(Date.now() - STALE_MS) } }] },
    orderBy: { healthCheckAt: { sort: 'asc', nulls: 'first' } }, take: BATCH, select: { id: true, destination: true },
  });
  for (const l of links) {
    const code = await status(l.destination);
    await prisma.link.update({ where: { id: l.id }, data: { healthStatus: code, healthCheckAt: new Date() } });
  }
  return links.length;
}

export function startHealthMonitor(log = console) {
  const tick = () => checkBatch().then(n => n && log.log(`[health] checked ${n} destinations`)).catch(err => log.error('[health]', err.message));
  setTimeout(tick, 15_000);
  return setInterval(tick, EVERY_MS);
}
