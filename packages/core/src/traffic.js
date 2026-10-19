import { createHash } from 'node:crypto';
import { isbot } from 'isbot';

// Link-preview fetchers that isbot may miss or that we want to name explicitly.
const PREVIEW_BOTS = /(slackbot|whatsapp|facebookexternalhit|twitterbot|telegrambot|discordbot|linkedinbot|skypeuripreview|embedly|pinterest|vkshare|redditbot|applebot|bingpreview|google-inspectiontool|headlesschrome|python-requests|curl\/|wget\/|go-http-client|axios\/|node-fetch|okhttp)/i;

/**
 * Decide whether a request should count as a human click.
 * @param {{ method?: string, userAgent?: string, headers?: Record<string,string|undefined>, burst?: number }} req
 * @returns {{ bot: boolean, reason: string|null }}
 */
export function classifyBot({ method = 'GET', userAgent = '', headers = {}, burst = 0 } = {}) {
  const ua = String(userAgent || '').trim();
  if (method.toUpperCase() === 'HEAD') return { bot: true, reason: 'head' };
  const purpose = String(headers['purpose'] || headers['sec-purpose'] || headers['x-purpose'] || '').toLowerCase();
  if (purpose.includes('prefetch') || purpose.includes('preview')) return { bot: true, reason: 'prefetch' };
  if (!ua) return { bot: true, reason: 'empty_ua' };
  if (PREVIEW_BOTS.test(ua)) return { bot: true, reason: 'preview_bot' };
  if (isbot(ua)) return { bot: true, reason: 'crawler' };
  if (burst > 20) return { bot: true, reason: 'burst' };
  return { bot: false, reason: null };
}

const SOCIAL = ['facebook.com', 'fb.com', 'instagram.com', 't.co', 'twitter.com', 'x.com', 'linkedin.com', 'lnkd.in',
  'whatsapp.com', 'wa.me', 'youtube.com', 'youtu.be', 'reddit.com', 'pinterest.com', 'tiktok.com', 'snapchat.com',
  'telegram.org', 't.me', 'discord.com', 'threads.net'];
const SEARCH = ['google.', 'bing.com', 'duckduckgo.com', 'search.yahoo.', 'yandex.', 'baidu.com', 'ecosia.org'];
const EMAIL = ['mail.google.com', 'outlook.live.com', 'outlook.office.com', 'mail.yahoo.com', 'mail.proton.me'];

export function referrerDomain(referer) {
  if (!referer) return null;
  try { return new URL(referer).hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, ''); } catch { return null; }
}

/** direct | social | search | email | qr | referral */
export function classifySource({ referer, viaQr = false, utmSource } = {}) {
  if (viaQr) return 'qr';
  const d = referrerDomain(referer);
  const utm = String(utmSource || '').toLowerCase();
  if (utm === 'email' || utm === 'newsletter') return 'email';
  if (!d) return utm && ['instagram', 'facebook', 'twitter', 'x', 'linkedin', 'whatsapp'].includes(utm) ? 'social' : 'direct';
  if (EMAIL.some(e => d === e)) return 'email';
  if (SOCIAL.some(s => d === s || d.endsWith('.' + s))) return 'social';
  if (SEARCH.some(s => d.startsWith(s) || d.includes('.' + s))) return 'search';
  return 'referral';
}

/** Daily-rotating salt means a visitor cannot be tracked across days or links' owners. */
export function dailySalt(secret, date = new Date()) {
  return createHash('sha256').update(`${secret}:${date.toISOString().slice(0, 10)}`).digest('hex');
}

/** Unique visitor id: SHA-256(IP + user agent + daily salt). No cookies, raw IP never stored. */
export function visitorHash(ip, userAgent, salt) {
  return createHash('sha256').update(`${ip}|${userAgent || ''}|${salt}`).digest('hex').slice(0, 32);
}

/** Keep only the network part of an IP for any stored copy. */
export function truncateIp(ip) {
  if (!ip) return null;
  if (ip.includes('.')) return ip.split('.').slice(0, 3).join('.') + '.0';
  return ip.split(':').slice(0, 3).join(':') + '::';
}
