// Custom alias rules: 3–30 chars, letters, digits, - and _, case-insensitive unique,
// not a reserved route and not a blocked word.

export const ALIAS_MIN = 3;
export const ALIAS_MAX = 30;
export const ALIAS_PATTERN = /^[A-Za-z0-9_-]+$/;

// Paths the platform itself uses under the short domain.
export const RESERVED = new Set([
  'api', 'app', 'admin', 'login', 'logout', 'register', 'signup', 'dashboard', 'static', 'assets',
  'health', 'status', 'help', 'about', 'settings', 'report', 'preview', 'qr', 'bio', 'favicon.ico',
  'robots.txt', 'unlock', 'links', 'campaigns', 'import', 'linkpulse', 'www', 'docs',
]);

const BLOCKED_WORDS = ['fuck', 'shit', 'bitch', 'cunt', 'porn', 'nigg', 'rape', 'whore', 'slut'];

export function isReserved(code) {
  return RESERVED.has(String(code).toLowerCase());
}

export function hasBlockedWord(code) {
  const c = String(code).toLowerCase().replace(/[-_]/g, '');
  return BLOCKED_WORDS.some(w => c.includes(w));
}

const issue = (code, message) => ({ field: 'alias', code, message });

/** Format checks only; uniqueness needs the database. */
export function validateAlias(alias) {
  const a = String(alias ?? '').trim();
  const errors = [];
  if (a.length < ALIAS_MIN || a.length > ALIAS_MAX) errors.push(issue('length', `Aliases are ${ALIAS_MIN}–${ALIAS_MAX} characters.`));
  if (a && !ALIAS_PATTERN.test(a)) errors.push(issue('chars', 'Use letters, numbers, - and _ only.'));
  if (isReserved(a)) errors.push(issue('reserved', `“${a}” is reserved by LinkPulse.`));
  else if (hasBlockedWord(a)) errors.push(issue('blocked_word', 'That alias is not allowed.'));
  return { alias: a, errors };
}

/**
 * Suggest free alternatives for a taken alias.
 * `isTaken(lower)` is async; returns up to `count` available suggestions.
 */
export async function suggestAliases(alias, isTaken, { count = 3, year = new Date().getFullYear() } = {}) {
  const base = String(alias).trim().slice(0, ALIAS_MAX - 4).replace(/[^A-Za-z0-9_-]/g, '-') || 'link';
  const yy = String(year).slice(-2);
  const candidates = [`${base}-${yy}`, `${base}-${year}`, `${base}-2`, `${base}-3`, `${base}-hq`, `${base}-go`];
  for (let i = 0; i < 6; i++) candidates.push(`${base}-${Math.random().toString(36).slice(2, 5)}`);
  const out = [];
  for (const c of candidates) {
    if (out.length >= count) break;
    if (c.length > ALIAS_MAX || validateAlias(c).errors.length) continue;
    if (!(await isTaken(c.toLowerCase()))) out.push(c);
  }
  return out;
}
