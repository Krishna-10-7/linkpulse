import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '@linkpulse/runtime';

// After a correct password the visitor gets a signed, link-scoped cookie for 12 hours.
export const UNLOCK_TTL_MS = 12 * 60 * 60 * 1000;

const sign = (linkId, exp) => createHmac('sha256', config.sessionSecret).update(`unlock:${linkId}:${exp}`).digest('base64url');

export const cookieName = linkId => `lpu_${linkId}`;

export function makeUnlockToken(linkId, now = Date.now()) {
  const exp = now + UNLOCK_TTL_MS;
  return `${exp}.${sign(linkId, exp)}`;
}

export function verifyUnlockToken(linkId, token, now = Date.now()) {
  if (!token) return false;
  const [expStr, sig] = String(token).split('.');
  const exp = Number(expStr);
  if (!exp || exp < now || !sig) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(linkId, exp));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
