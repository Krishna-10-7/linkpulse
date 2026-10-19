import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyBot, classifySource, visitorHash, dailySalt, truncateIp } from '../src/traffic.js';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1';

test('real browsers are humans', () => {
  assert.equal(classifyBot({ userAgent: CHROME }).bot, false);
  assert.equal(classifyBot({ userAgent: IPHONE }).bot, false);
});

test('link previews, crawlers, HEAD and prefetch are bots', () => {
  assert.equal(classifyBot({ userAgent: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)' }).reason, 'preview_bot');
  assert.equal(classifyBot({ userAgent: 'WhatsApp/2.23.20.0' }).reason, 'preview_bot');
  assert.equal(classifyBot({ userAgent: 'Googlebot/2.1 (+http://www.google.com/bot.html)' }).bot, true);
  assert.equal(classifyBot({ userAgent: 'curl/8.4.0' }).bot, true);
  assert.equal(classifyBot({ method: 'HEAD', userAgent: CHROME }).reason, 'head');
  assert.equal(classifyBot({ userAgent: CHROME, headers: { 'sec-purpose': 'prefetch;prerender' } }).reason, 'prefetch');
  assert.equal(classifyBot({ userAgent: '' }).reason, 'empty_ua');
});

test('click bursts from one visitor are treated as bots', () => {
  assert.equal(classifyBot({ userAgent: CHROME, burst: 21 }).reason, 'burst');
  assert.equal(classifyBot({ userAgent: CHROME, burst: 20 }).bot, false);
});

test('traffic sources', () => {
  assert.equal(classifySource({}), 'direct');
  assert.equal(classifySource({ viaQr: true, referer: 'https://google.com' }), 'qr');
  assert.equal(classifySource({ referer: 'https://l.instagram.com/?u=x' }), 'social');
  assert.equal(classifySource({ referer: 'https://t.co/abc' }), 'social');
  assert.equal(classifySource({ referer: 'https://www.google.co.in/' }), 'search');
  assert.equal(classifySource({ referer: 'https://mail.google.com/mail/u/0/' }), 'email');
  assert.equal(classifySource({ referer: 'https://blog.example.com/post' }), 'referral');
});

test('visitor hash is stable within a day and changes across days', () => {
  const s1 = dailySalt('k', new Date('2026-10-19T01:00:00Z'));
  const s2 = dailySalt('k', new Date('2026-10-19T23:00:00Z'));
  const s3 = dailySalt('k', new Date('2026-10-20T01:00:00Z'));
  assert.equal(visitorHash('1.2.3.4', CHROME, s1), visitorHash('1.2.3.4', CHROME, s2));
  assert.notEqual(visitorHash('1.2.3.4', CHROME, s1), visitorHash('1.2.3.4', CHROME, s3));
  assert.notEqual(visitorHash('1.2.3.4', CHROME, s1), visitorHash('1.2.3.5', CHROME, s1));
});

test('stored IPs are truncated', () => {
  assert.equal(truncateIp('203.0.113.77'), '203.0.113.0');
  assert.equal(truncateIp('2001:db8:85a3:8d3:1319:8a2e:370:7348'), '2001:db8:85a3::');
});
