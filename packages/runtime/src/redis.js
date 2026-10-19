import Redis from 'ioredis';
import { config } from './config.js';

// Every Redis key the platform uses, in one place.
export const keys = {
  link: codeLower => `lp:link:${codeLower}`,        // cached link + rules (JSON)
  cap: linkId => `lp:cap:${linkId}`,                // atomic human-click counter for click caps
  burst: (linkId, visitor, minute) => `lp:burst:${linkId}:${visitor}:${minute}`,
  unique: (linkId, day, visitor) => `lp:uv:${linkId}:${day}:${visitor}`,
  pwTries: (linkId, visitor) => `lp:pw:${linkId}:${visitor}`,
  bucket: name => `lp:rl:${name}`,
  clickStream: 'lp:clicks',
  liveChannel: 'lp:live',
};

export const CLICK_GROUP = 'click-workers';

let shared;
/** Shared connection for commands. Subscribers must use their own via createRedis(). */
export function redis() {
  if (!shared) shared = createRedis();
  return shared;
}

export function createRedis() {
  const r = new Redis(config.redisUrl, { maxRetriesPerRequest: 2, enableAutoPipelining: true, lazyConnect: false });
  r.on('error', err => console.error('[redis]', err.message));
  return r;
}
