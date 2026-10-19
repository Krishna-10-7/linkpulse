import UAParser from 'ua-parser-js';
import geoip from 'geoip-lite';
import { classifySource, referrerDomain } from '@linkpulse/core';

/** Turn a raw stream entry into a click_events row (minus uniqueness). */
export function enrich(f) {
  const ua = new UAParser(f.ua || '').getResult();
  const bot = f.bot === '1';
  const dt = ua.device.type;
  const deviceType = bot ? 'bot' : dt === 'mobile' || dt === 'tablet' ? dt : (ua.os.name || ua.browser.name) ? 'desktop' : 'other';
  const geo = f.ip ? geoip.lookup(f.ip.replace(/^::ffff:/, '')) : null;
  const viaQr = f.qr === '1';
  return {
    linkId: f.linkId,
    ts: new Date(Number(f.ts) || Date.now()),
    visitorHash: f.visitor,
    country: geo?.country || null,
    city: geo?.city || null,
    deviceType,
    os: ua.os.name || null,
    browser: ua.browser.name || null,
    referrerDomain: referrerDomain(f.referer),
    source: classifySource({ referer: f.referer, viaQr, utmSource: f.utmSource }),
    isBot: bot,
    viaQr,
  };
}

/** Redis stream entries arrive as flat [k1, v1, k2, v2, …] arrays. */
export function fieldsOf(arr) {
  const o = {};
  for (let i = 0; i < arr.length; i += 2) o[arr[i]] = arr[i + 1];
  return o;
}
