// The redirect rule engine. Pure function: give it a link and a request context,
// get back exactly one outcome. Order matters and is fixed:
//
//   1 lookup  2 admin disabled  3 paused/archived  4 not live yet  5 expired
//   6 click cap  7 password  8 targeting  9 redirect (click is logged by the caller)

export const OUTCOME = Object.freeze({
  NOT_FOUND: 'not_found',
  DISABLED: 'disabled',
  INACTIVE: 'inactive',
  NOT_LIVE: 'not_live',
  EXPIRED: 'expired',
  LIMIT: 'limit',
  PASSWORD: 'password',
  REDIRECT: 'redirect',
});

export const HTTP_STATUS = Object.freeze({
  not_found: 404,
  disabled: 410,
  inactive: 410,
  not_live: 404,
  expired: 410,
  limit: 410,
  password: 401,
  redirect: 302,
});

/**
 * @param {object|null} link  { status, startsAt, expiresAt, clickLimit, clickCount, passwordHash, destination, rules[] }
 * @param {object} ctx        { now: Date, unlocked: boolean, device, os, country, currentClicks?: number }
 * @returns {{ outcome: string, step: number, status: number, destination?: string, rule?: object }}
 */
export function evaluate(link, ctx = {}) {
  const now = ctx.now ?? new Date();
  const done = (outcome, step, extra = {}) => ({ outcome, step, status: HTTP_STATUS[outcome], ...extra });

  if (!link) return done(OUTCOME.NOT_FOUND, 1);
  if (link.status === 'DISABLED') return done(OUTCOME.DISABLED, 2);
  if (link.status === 'PAUSED' || link.status === 'ARCHIVED') return done(OUTCOME.INACTIVE, 3);
  if (link.startsAt && new Date(link.startsAt) > now) return done(OUTCOME.NOT_LIVE, 4);
  if (link.expiresAt && new Date(link.expiresAt) <= now) return done(OUTCOME.EXPIRED, 5);

  const clicks = ctx.currentClicks ?? link.clickCount ?? 0;
  if (link.clickLimit != null && clicks >= link.clickLimit) return done(OUTCOME.LIMIT, 6);

  if (link.passwordHash && !ctx.unlocked) return done(OUTCOME.PASSWORD, 7);

  const rule = pickRule(link.rules ?? [], ctx);
  return done(OUTCOME.REDIRECT, rule ? 8 : 9, { destination: rule ? rule.destination : link.destination, rule: rule ?? undefined });
}

/** Highest priority first; the first matching rule wins. */
export function pickRule(rules, ctx) {
  const sorted = [...rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  for (const r of sorted) {
    const value = String(r.value || '').toLowerCase();
    if (r.type === 'device' && value === String(ctx.device || '').toLowerCase()) return r;
    if (r.type === 'os' && value === String(ctx.os || '').toLowerCase()) return r;
    if (r.type === 'country' && value === String(ctx.country || '').toLowerCase()) return r;
  }
  return null;
}
