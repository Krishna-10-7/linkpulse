// Shared configuration, read once from the environment.
// Locally: node --env-file=../../.env …   In production: systemd EnvironmentFile.

const env = process.env;

function zone(name) {
  try { new Intl.DateTimeFormat('en', { timeZone: name }); return name; } catch { throw new Error(`APP_TIMEZONE "${name}" is not a valid time zone`); }
}

function required(name, fallback) {
  const v = env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing required environment variable ${name}`);
  return v;
}

const publicBaseUrl = required('PUBLIC_BASE_URL', 'http://localhost:8440/lk').replace(/\/+$/, '');
const publicUrl = new URL(publicBaseUrl);

export const config = Object.freeze({
  production: env.NODE_ENV === 'production',
  databaseUrl: env.DATABASE_URL,
  redisUrl: required('REDIS_URL', 'redis://127.0.0.1:6379'),
  publicBaseUrl,
  publicHost: publicUrl.hostname,
  basePath: (env.BASE_PATH ?? publicUrl.pathname).replace(/\/+$/, ''),
  sessionSecret: required('SESSION_SECRET', env.NODE_ENV === 'production' ? undefined : 'dev-only-secret'),
  apiPort: Number(env.API_PORT || 8441),
  redirectPort: Number(env.REDIRECT_PORT || 8442),
  gatewayPort: Number(env.GATEWAY_PORT || 8440),
  safeBrowsingKey: env.SAFE_BROWSING_KEY || '',
  // Calendar days for rollups and charts (an 11 PM click in India counts for that day).
  timezone: zone(env.APP_TIMEZONE || 'Asia/Kolkata'),
});

/** Absolute short URL for a code, e.g. https://r2-d2.xyz/lk/diwali */
export const shortUrl = code => `${config.publicBaseUrl}/${code}`;
