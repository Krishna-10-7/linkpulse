import { createRedis, keys } from '@linkpulse/runtime';
import { requireUser } from '../plugins/auth.js';

// Server-sent events: the worker publishes each processed click on a Redis channel,
// and every connected dashboard receives the clicks for links it owns.

const clients = new Set();
let subscriber;

function ensureSubscriber(log) {
  if (subscriber) return;
  subscriber = createRedis();
  subscriber.subscribe(keys.liveChannel).catch(err => log.error({ err }, 'live subscribe failed'));
  subscriber.on('message', (_channel, message) => {
    let evt;
    try { evt = JSON.parse(message); } catch { return; }
    for (const c of clients) {
      if (c.all || c.userId === evt.ownerId) c.send('click', evt);
    }
  });
}

export async function streamRoutes(app) {
  app.get('/api/stream', { preHandler: requireUser }, (req, reply) => {
    ensureSubscriber(app.log);
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    const client = {
      userId: req.user.id,
      all: req.user.role === 'ADMIN' && req.query.scope === 'platform',
      send(event, data) { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); },
    };
    clients.add(client);
    res.write('retry: 5000\n\n');
    client.send('hello', { at: new Date().toISOString() });
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.raw.on('close', () => { clearInterval(ping); clients.delete(client); });
  });
}
