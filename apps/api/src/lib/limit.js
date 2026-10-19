import { takeToken, LIMITS } from '@linkpulse/runtime';
import { HttpError } from './http.js';

/** Throws a 429 with Retry-After when the bucket for (name, id) is empty. */
export async function enforce(name, id, cost = 1) {
  const res = await takeToken(name, id, LIMITS[name], cost);
  if (!res.allowed) {
    const err = new HttpError(429, 'rate_limited', `Too many requests. Try again in ${res.retryAfter} seconds.`, { retryAfter: res.retryAfter });
    err.headers = { 'retry-after': String(res.retryAfter) };
    throw err;
  }
  return res;
}
