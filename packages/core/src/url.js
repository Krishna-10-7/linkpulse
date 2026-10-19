// Destination URL validation. Errors block publishing; warnings need acknowledgement.
// Network checks (DNS, reachability, Safe Browsing) live in the API; this module is pure.

export const MAX_URL_LENGTH = 2048;

export const KNOWN_SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly',
  'cutt.ly', 'shorturl.at', 'rb.gy', 'tiny.cc', 'bl.ink', 'lnkd.in', 'dub.sh',
]);

const issue = (code, message) => ({ field: 'destination', code, message });

/** Adds https:// when the scheme is missing, trims whitespace. */
export function normalizeUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
  return 'https://' + raw;
}

export function isPrivateIPv4(host) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224;
}

export function isPrivateIPv6(host) {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (!h.includes(':')) return false;
  if (h === '::1' || h === '::') return true;
  if (h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h);
  return mapped ? isPrivateIPv4(mapped[1]) : false;
}

export function isInternalHostname(host) {
  const h = host.toLowerCase().replace(/\.$/, '');
  return h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') ||
    h.endsWith('.internal') || h.endsWith('.lan') || h.endsWith('.home.arpa') || !h.includes('.');
}

/**
 * @param {string} input
 * @param {{ ownHost?: string, ownPath?: string, blockedDomains?: Iterable<string> }} opts
 * @returns {{ url: string|null, hostname: string|null, errors: object[], warnings: object[] }}
 */
export function validateDestination(input, opts = {}) {
  const errors = [], warnings = [];
  const normalized = normalizeUrl(input);
  if (!normalized) return { url: null, hostname: null, errors: [issue('required', 'Enter a destination URL.')], warnings };
  if (normalized.length > MAX_URL_LENGTH) errors.push(issue('too_long', `URLs can be at most ${MAX_URL_LENGTH} characters.`));

  let u;
  try { u = new URL(normalized); } catch {
    return { url: null, hostname: null, errors: [issue('invalid', 'That is not a valid URL.')], warnings };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    errors.push(issue('scheme', 'Only http and https links can be shortened.'));
    return { url: null, hostname: null, errors, warnings };
  }
  if (u.username || u.password) errors.push(issue('credentials', 'URLs with embedded usernames or passwords are not allowed.'));

  const host = u.hostname.toLowerCase();
  if (isPrivateIPv4(host) || isPrivateIPv6(host) || isInternalHostname(host)) {
    errors.push(issue('private', 'Links to local or private network addresses are not allowed.'));
  }

  const blocked = matchBlocked(host, opts.blockedDomains);
  if (blocked) errors.push(issue('blocked', `${blocked} is on the blocklist.`));

  if (opts.ownHost && host === opts.ownHost.toLowerCase() && (!opts.ownPath || u.pathname.startsWith(opts.ownPath))) {
    errors.push(issue('loop', 'That is already a LinkPulse link — shortening it would create a redirect loop.'));
  } else if (KNOWN_SHORTENERS.has(host.replace(/^www\./, ''))) {
    warnings.push(issue('shortener', `${host} is another shortener. Visitors will be redirected twice.`));
  }
  if (u.protocol === 'http:') warnings.push(issue('insecure', 'This link is not HTTPS.'));

  return { url: u.toString(), hostname: host, errors, warnings };
}

/** Returns the blocklist entry that matches the host or one of its parent domains. */
export function matchBlocked(host, blockedDomains) {
  if (!blockedDomains) return null;
  const set = blockedDomains instanceof Set ? blockedDomains : new Set([...blockedDomains].map(d => d.toLowerCase()));
  const parts = host.toLowerCase().split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    if (set.has(candidate)) return candidate;
  }
  return null;
}

export function domainOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; }
}
