import Fastify from 'fastify';
import formbody from '@fastify/formbody';
import bcrypt from 'bcryptjs';
import UAParser from 'ua-parser-js';
import { evaluate, OUTCOME, classifyBot, dailySalt, visitorHash } from '@linkpulse/core';
import { config, redis, keys, getLinkByCode } from '@linkpulse/runtime';
import { pages } from './pages.js';
import { cookieName, makeUnlockToken, verifyUnlockToken, parseCookies, UNLOCK_TTL_MS } from './unlock.js';

const MAX_PASSWORD_TRIES = 5;
const PASSWORD_WINDOW_SECONDS = 15 * 60;

// The fast path. Look the link up in Redis, run the nine checks, answer with a 302,
// and hand the click to the worker through a Redis stream without waiting for it.

const app = Fastify({ logger: { level: config.production ? 'warn' : 'info' }, trustProxy: true });
const r = redis();

function deviceOf(ua) {
  const p = new UAParser(ua).getResult();
  const type = p.device.type === 'mobile' || p.device.type === 'tablet' ? p.device.type : 'desktop';
  return { device: type, os: p.os.name || null, browser: p.browser.name || null };
}

const html = (reply, status, body) => reply.code(status).header('cache-control', 'no-store').type('text/html; charset=utf-8').send(body);

async function logClick(link, req, { bot, botReason, destination, visitor }) {
  const q = req.query || {};
  await r.xadd(keys.clickStream, 'MAXLEN', '~', 200000, '*',
    'linkId', link.id, 'ownerId', link.ownerId, 'ts', String(Date.now()), 'visitor', visitor,
    'ip', req.ip || '', 'ua', req.headers['user-agent'] || '', 'referer', req.headers['referer'] || '',
    'lang', req.headers['accept-language'] || '', 'qr', q.src === 'qr' ? '1' : '0', 'utmSource', String(q.utm_source || ''),
    'bot', bot ? '1' : '0', 'botReason', botReason || '', 'destination', destination,
  ).catch(err => req.log.error({ err }, 'click enqueue failed'));
}

async function handle(req, reply) {
  const raw = String(req.params.code || '');
  const link = await getLinkByCode(raw.toLowerCase());
  const ua = req.headers['user-agent'] || '';
  const { device, os } = deviceOf(ua);
  const visitor = visitorHash(req.ip, ua, dailySalt(config.sessionSecret));

  let currentClicks;
  if (link?.clickLimit != null) currentClicks = Number(await r.get(keys.cap(link.id))) || 0;

  const unlocked = link?.passwordHash ? verifyUnlockToken(link.id, parseCookies(req.headers.cookie)[cookieName(link.id)]) : false;
  const result = evaluate(link, { now: new Date(), device, os, currentClicks, unlocked });

  switch (result.outcome) {
    case OUTCOME.NOT_FOUND: return html(reply, 404, pages.notFound(raw));
    case OUTCOME.DISABLED: return html(reply, 410, pages.disabled(raw));
    case OUTCOME.INACTIVE: return html(reply, 410, pages.inactive());
    case OUTCOME.NOT_LIVE: return html(reply, 404, pages.notLive(link.startsAt));
    case OUTCOME.EXPIRED: return html(reply, 410, pages.expired(link.expiresAt));
    case OUTCOME.LIMIT: return html(reply, 410, pages.limit());
    case OUTCOME.PASSWORD: return html(reply, 401, pages.password(link.code, null, queryString(req)));
    default: break;
  }

  // Bots never consume a click cap and are logged but not counted.
  const minute = Math.floor(Date.now() / 60000);
  const burstKey = keys.burst(link.id, visitor, minute);
  const burst = await r.incr(burstKey);
  if (burst === 1) r.expire(burstKey, 120).catch(() => {});
  const { bot, reason } = classifyBot({ method: req.method, userAgent: ua, headers: req.headers, burst });

  if (!bot && link.clickLimit != null) {
    // Atomic reservation: concurrent clicks can never overshoot the cap.
    const n = await r.incr(keys.cap(link.id));
    if (n > link.clickLimit) {
      await r.decr(keys.cap(link.id));
      return html(reply, 410, pages.limit());
    }
  }

  logClick(link, req, { bot, botReason: reason, destination: result.destination, visitor });
  return reply.code(302).header('cache-control', 'private, no-store').header('location', result.destination).send();
}

function queryString(req) {
  const i = req.url.indexOf('?');
  return i >= 0 ? req.url.slice(i) : '';
}

async function unlock(req, reply) {
  const code = String(req.params.code || '');
  const link = await getLinkByCode(code.toLowerCase());
  if (!link || !link.passwordHash) return reply.redirect(303, `${config.basePath}/${code}${queryString(req)}`);

  const ua = req.headers['user-agent'] || '';
  const visitor = visitorHash(req.ip, ua, dailySalt(config.sessionSecret));
  const triesKey = keys.pwTries(link.id, visitor);
  const tries = await r.incr(triesKey);
  if (tries === 1) await r.expire(triesKey, PASSWORD_WINDOW_SECONDS);
  if (tries > MAX_PASSWORD_TRIES) return html(reply, 429, pages.tooMany());

  const ok = await bcrypt.compare(String(req.body?.password || ''), link.passwordHash);
  if (!ok) {
    const left = MAX_PASSWORD_TRIES - tries;
    return html(reply, 401, pages.password(link.code, `Wrong password. ${left} ${left === 1 ? 'try' : 'tries'} left.`, queryString(req)));
  }
  await r.del(triesKey);
  const cookie = [
    `${cookieName(link.id)}=${makeUnlockToken(link.id)}`,
    `Path=${config.basePath}/${link.code}`, `Max-Age=${UNLOCK_TTL_MS / 1000}`, 'HttpOnly', 'SameSite=Lax',
    config.production ? 'Secure' : '',
  ].filter(Boolean).join('; ');
  return reply.header('set-cookie', cookie).redirect(303, `${config.basePath}/${link.code}${queryString(req)}`);
}

await app.register(formbody);

app.get('/health', async () => ({ ok: true, redis: (await r.ping().catch(() => 'down')) === 'PONG' }));
app.post('/:code/unlock', unlock);
app.get('/', async (req, reply) => reply.redirect(`${config.basePath}/app/`));
app.route({ method: ['GET', 'HEAD'], url: '/:code', handler: handle });

app.listen({ port: config.redirectPort, host: '127.0.0.1' }).then(() => {
  app.log.info(`redirect service on :${config.redirectPort}`);
});
