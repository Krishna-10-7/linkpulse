import { redis, keys } from './redis.js';

// Token bucket in Redis. One Lua script per call keeps check-and-take atomic across processes.
// capacity tokens, refilled continuously at capacity / windowSeconds per second.
const SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local state = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(state[1]) or capacity
local ts = tonumber(state[2]) or now
tokens = math.min(capacity, tokens + (now - ts) * rate)
local allowed = 0
if tokens >= cost then tokens = tokens - cost; allowed = 1 end
redis.call('HSET', key, 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', key, math.ceil(capacity / rate * 1000) + 1000)
local wait = 0
if allowed == 0 then wait = math.ceil((cost - tokens) / rate) end
return { allowed, math.floor(tokens), wait }
`;

export const LIMITS = Object.freeze({
  createLink: { capacity: 30, windowSeconds: 60 },     // 30 links / minute / user
  importJob: { capacity: 5, windowSeconds: 3600 },     // 5 CSV imports / hour / user
  login: { capacity: 10, windowSeconds: 900 },         // 10 sign-in attempts / 15 min / IP
  register: { capacity: 5, windowSeconds: 3600 },      // 5 sign-ups / hour / IP
  report: { capacity: 10, windowSeconds: 3600 },       // 10 abuse reports / hour / visitor
  publicApi: { capacity: 60, windowSeconds: 60 },     // 60 requests / minute / access token
});

/** @returns {Promise<{ allowed: boolean, remaining: number, retryAfter: number }>} */
export async function takeToken(name, id, { capacity, windowSeconds }, cost = 1) {
  try {
    const [allowed, remaining, wait] = await redis().eval(SCRIPT, 1, keys.bucket(`${name}:${id}`), capacity, capacity / windowSeconds, Date.now() / 1000, cost);
    return { allowed: allowed === 1, remaining, retryAfter: wait };
  } catch {
    return { allowed: true, remaining: capacity, retryAfter: 0 }; // fail open if Redis is down
  }
}
