// Demo data: an admin, a demo user, three campaigns, ~18 links covering every rule
// (password, click cap, expiry, schedule, device targeting, admin-disabled, flagged)
// and about 4,000 clicks over the last 30 days with realistic sources and devices.
//
//   npm run db:seed            (reads DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD)
//
// Demo account: demo@linkpulse.app / pulse-demo-2026 (override with SEED_DEMO_PASSWORD).

import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from './index.js';

const DEMO_EMAIL = 'demo@linkpulse.app';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || 'pulse-demo-2026';
const DAY = 86400000;

let seed = 20261019;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = weights => {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (const [k, w] of Object.entries(weights)) if ((r -= w) <= 0) return k;
  return Object.keys(weights)[0];
};

const SOURCES = { social: 38, direct: 22, qr: 14, search: 10, email: 9, referral: 7 };
const REFERRERS = { social: ['instagram.com', 'x.com', 'whatsapp.com', 'linkedin.com', 'facebook.com', 'youtube.com'], search: ['google.com', 'bing.com', 'duckduckgo.com'], email: ['mail.google.com', 'outlook.live.com'], referral: ['medium.com', 'reddit.com', 'news.ycombinator.com'] };
const DEVICES = { mobile: 62, desktop: 31, tablet: 7 };
const OS = { mobile: { Android: 64, iOS: 36 }, tablet: { iOS: 60, Android: 40 }, desktop: { Windows: 58, 'Mac OS': 30, Linux: 12 } };
// Browsers depend on the operating system, so the demo never shows pairs like "Mobile Safari on Android".
const BROWSERS = {
  Android: { Chrome: 78, 'Samsung Browser': 15, Firefox: 4, Opera: 3 },
  iOS: { 'Mobile Safari': 82, Chrome: 15, Firefox: 3 },
  Windows: { Chrome: 66, Edge: 24, Firefox: 10 },
  'Mac OS': { Safari: 48, Chrome: 46, Firefox: 6 },
  Linux: { Chrome: 60, Firefox: 40 },
};
const COUNTRIES = { IN: 61, US: 11, AE: 6, GB: 5, SG: 4, CA: 3, DE: 3, AU: 3, NP: 2, BD: 2 };
const CITIES = { IN: ['Mumbai', 'Delhi', 'Bengaluru', 'Dehradun', 'Pune', 'Hyderabad', 'Haldwani'], US: ['New York', 'San Jose', 'Austin'], AE: ['Dubai'], GB: ['London'], SG: ['Singapore'], CA: ['Toronto'], DE: ['Berlin'], AU: ['Sydney'], NP: ['Kathmandu'], BD: ['Dhaka'] };

async function upsertUser(email, name, password, role) {
  const passwordHash = await bcrypt.hash(password, 11);
  const existing = await prisma.user.findUnique({ where: { email }, include: { memberships: true } });
  if (existing) return prisma.user.update({ where: { id: existing.id }, data: { passwordHash, role, name }, include: { memberships: true } });
  return prisma.user.create({
    data: { email, name, passwordHash, role, memberships: { create: { workspace: { create: { name: `${name.split(' ')[0]}'s workspace` } } } } },
    include: { memberships: true },
  });
}

function makeClicks(link, total, { days = 30, botRate = 0.08, qrBoost = 0, endDaysAgo = 0, mobileBoost = 0 } = {}) {
  const rows = [];
  const pool = Array.from({ length: Math.max(3, Math.round(total * 0.68)) }, () => randomBytes(16).toString('hex'));
  const seen = new Set();
  const now = Date.now() - endDaysAgo * DAY;
  for (let i = 0; i < total; i++) {
    // More clicks recently, and more in the Indian evening.
    const dayBack = Math.floor(Math.pow(rand(), 1.6) * days);
    const hour = Math.floor((rand() < 0.65 ? 14 + rand() * 9 : rand() * 24));
    const ts = new Date(now - dayBack * DAY - ((new Date(now).getUTCHours() - hour + 24) % 24) * 3600000 - Math.floor(rand() * 3600000));
    if (ts > new Date()) continue;
    const isBot = rand() < botRate;
    let source = pick(SOURCES);
    if (rand() < qrBoost) source = 'qr';
    const deviceType = isBot ? 'bot' : rand() < mobileBoost ? 'mobile' : pick(DEVICES);
    const os = isBot ? null : pick(OS[deviceType]);
    const country = pick(COUNTRIES);
    const cities = CITIES[country];
    const visitorHash = isBot ? randomBytes(16).toString('hex') : pool[Math.floor(rand() * pool.length)];
    const day = ts.toISOString().slice(0, 10);
    const uk = `${visitorHash}|${day}`;
    const isUnique = !isBot && !seen.has(uk);
    if (isUnique) seen.add(uk);
    const refs = REFERRERS[source];
    rows.push({
      linkId: link.id, ts, visitorHash, isBot, isUnique, viaQr: source === 'qr',
      source: isBot ? 'direct' : source, deviceType,
      os, browser: os ? pick(BROWSERS[os]) : null,
      country: isBot ? 'US' : country, city: isBot ? null : cities[Math.floor(rand() * cities.length)],
      referrerDomain: refs && !isBot ? refs[Math.floor(rand() * refs.length)] : null,
    });
  }
  return rows;
}

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@linkpulse.local').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || adminPassword === 'change-me') throw new Error('Set ADMIN_PASSWORD before seeding.');

  const admin = await upsertUser(adminEmail, 'Platform Admin', adminPassword, 'ADMIN');

  // Recreate the demo workspace from scratch so the seed can be re-run.
  const old = await prisma.user.findUnique({ where: { email: DEMO_EMAIL }, include: { memberships: true } });
  if (old) {
    for (const m of old.memberships) await prisma.workspace.delete({ where: { id: m.workspaceId } }).catch(() => {});
    await prisma.user.delete({ where: { id: old.id } });
  }
  const demo = await upsertUser(DEMO_EMAIL, 'Demo Marketer', DEMO_PASSWORD, 'USER');
  const ws = demo.memberships[0].workspaceId;

  await prisma.blockedDomain.upsert({ where: { domain: 'phish.example' }, update: {}, create: { domain: 'phish.example', reason: 'Known credential-phishing domain', addedById: admin.id } });
  await prisma.blockedDomain.upsert({ where: { domain: 'free-crypto-gift.example' }, update: {}, create: { domain: 'free-crypto-gift.example', reason: 'Crypto giveaway scam', addedById: admin.id } });

  const campaign = async (name, description, goalClicks, startsDaysAgo) => prisma.campaign.create({ data: { workspaceId: ws, name, description, goalClicks, startsAt: new Date(Date.now() - startsDaysAgo * DAY) } });
  const diwali = await campaign('Diwali Festive Sale', 'Festive collection push across Instagram, WhatsApp and email.', 3000, 21);
  const college = await campaign('Back to College', 'Student offers shared with campus clubs and QR posters.', 1500, 30);
  const creators = await campaign('Creator Collab', 'Links shared by partner creators in their bios.', 1000, 14);

  const tagIds = {};
  for (const name of ['festive', 'sale', 'apparel', 'students', 'qr-poster', 'creators', 'newsletter', 'docs']) {
    tagIds[name] = (await prisma.tag.create({ data: { workspaceId: ws, name } })).id;
  }

  const shop = q => `https://example.com/?${q}`;
  const links = [
    { code: 'diwali', destination: shop('collection=diwali-2026&utm_campaign=diwali-festive-sale'), title: 'Diwali festive collection', campaign: diwali, tags: ['festive', 'sale'], clicks: 1180, opt: { mobileBoost: 0.2 },
      rules: [{ type: 'os', value: 'iOS', destination: shop('collection=diwali-2026&app=ios'), priority: 10 }, { type: 'device', value: 'mobile', destination: shop('collection=diwali-2026&app=android'), priority: 5 }] },
    { code: 'diwali-kurtas', destination: shop('collection=kurtas'), title: 'Festive kurta sets', campaign: diwali, tags: ['festive', 'apparel'], clicks: 640 },
    { code: 'flash500', destination: shop('sale=flash-500'), title: 'Flash sale — first 500 only', campaign: diwali, tags: ['sale'], clicks: 462, clickLimit: 500, opt: { days: 6 } },
    { code: 'diwali-mail', destination: shop('collection=diwali-2026&utm_source=newsletter'), title: 'Diwali newsletter hero', campaign: diwali, tags: ['newsletter'], clicks: 310 },
    { code: 'partners-diwali', destination: shop('page=partner-pricing'), title: 'Partner pricing (password)', campaign: diwali, tags: [], clicks: 64, password: 'partners-2026' },
    { code: 'diwali-gifting', destination: shop('collection=gifting'), title: 'Gifting guide — goes live soon', campaign: diwali, tags: ['festive'], clicks: 0, startsAt: new Date(Date.now() + 3 * DAY) },
    { code: 'college', destination: shop('offer=students'), title: 'Student offer — 20% off', campaign: college, tags: ['students'], clicks: 720, opt: { qrBoost: 0.35 } },
    { code: 'college-poster', destination: shop('offer=students&src=poster'), title: 'Campus poster QR', campaign: college, tags: ['students', 'qr-poster'], clicks: 390, opt: { qrBoost: 0.8 } },
    { code: 'fresher-kit', destination: shop('bundle=fresher-kit'), title: 'Fresher kit bundle', campaign: college, tags: ['students'], clicks: 205, expiresAt: new Date(Date.now() + 4 * DAY) },
    { code: 'summer-intern', destination: shop('careers=summer-internship'), title: 'Summer internship form (expired)', campaign: college, tags: ['students'], clicks: 180, expiresAt: new Date(Date.now() - 9 * DAY), opt: { endDaysAgo: 9, days: 20 } },
    { code: 'ananya-picks', destination: shop('creator=ananya'), title: "Ananya's festive picks", campaign: creators, tags: ['creators'], clicks: 260 },
    { code: 'rohan-tech', destination: shop('creator=rohan&category=gadgets'), title: "Rohan's gadget list", campaign: creators, tags: ['creators'], clicks: 175 },
    { code: 'creator-brief', destination: 'https://github.com/dubinc/dub', title: 'Creator programme brief', campaign: creators, tags: ['creators', 'docs'], clicks: 42 },
    { code: 'http-semantics', destination: 'https://www.rfc-editor.org/rfc/rfc9110', title: 'RFC 9110 — HTTP Semantics', tags: ['docs'], clicks: 58 },
    { code: 'redis-streams', destination: 'https://redis.io/docs/latest/develop/data-types/streams/', title: 'Redis Streams docs', tags: ['docs'], clicks: 37 },
    { code: 'free-gift', destination: 'https://gift-claim.example/win-iphone', title: 'Claim your free gift', tags: [], clicks: 214, disabled: 'Reported as phishing — credential harvesting page', opt: { endDaysAgo: 2, days: 6 } },
    { code: 'win-voucher', destination: shop('promo=voucher-wall'), title: 'Voucher wall', tags: ['sale'], clicks: 33, flagged: true },
    { code: 'old-catalogue', destination: shop('catalogue=2025'), title: '2025 catalogue', tags: [], clicks: 120, archived: true, opt: { endDaysAgo: 20, days: 10 } },
  ];

  let allClicks = 0;
  for (const l of links) {
    const link = await prisma.link.create({
      data: {
        code: l.code, codeLower: l.code.toLowerCase(), destination: l.destination, title: l.title, ownerId: demo.id, workspaceId: ws,
        campaignId: l.campaign?.id ?? null, clickLimit: l.clickLimit ?? null, startsAt: l.startsAt ?? null, expiresAt: l.expiresAt ?? null,
        passwordHash: l.password ? await bcrypt.hash(l.password, 10) : null,
        status: l.disabled ? 'DISABLED' : l.flagged ? 'PAUSED' : l.archived ? 'ARCHIVED' : 'ACTIVE',
        flagged: !!l.flagged,
        disabledReason: l.disabled || (l.flagged ? 'Auto-protect: 3 abuse reports' : null),
        disabledAt: l.disabled ? new Date(Date.now() - 2 * DAY) : null, disabledById: l.disabled ? admin.id : null,
        healthStatus: 200, healthCheckAt: new Date(),
        createdAt: new Date(Date.now() - (l.opt?.days ?? 30) * DAY - (l.opt?.endDaysAgo ?? 0) * DAY),
        tags: { create: l.tags.map(t => ({ tagId: tagIds[t] })) },
        rules: { create: l.rules ?? [] },
      },
    });
    const rows = makeClicks(link, l.clicks, l.opt);
    for (let i = 0; i < rows.length; i += 1000) await prisma.clickEvent.createMany({ data: rows.slice(i, i + 1000) });
    const humans = rows.filter(r => !r.isBot).length;
    await prisma.link.update({ where: { id: link.id }, data: { clickCount: humans } });
    allClicks += rows.length;
    if (l.flagged) {
      for (const reason of ['spam', 'phishing', 'spam']) {
        await prisma.abuseReport.create({ data: { linkId: link.id, reason, reporterHash: createHash('sha256').update(randomBytes(8)).digest('hex') } });
      }
    }
  }

  // Build the daily rollups from the events, exactly as the worker would.
  await prisma.$executeRaw`DELETE FROM "ClickDaily" WHERE "linkId" IN (SELECT id FROM "Link" WHERE "workspaceId" = ${ws})`;
  await prisma.$executeRaw`
    INSERT INTO "ClickDaily" ("linkId", "day", "clicks", "uniques", "bots", "qr")
    SELECT "linkId", date_trunc('day', "ts")::date,
           COUNT(*) FILTER (WHERE NOT "isBot"), COUNT(*) FILTER (WHERE "isUnique"),
           COUNT(*) FILTER (WHERE "isBot"), COUNT(*) FILTER (WHERE "viaQr" AND NOT "isBot")
    FROM "ClickEvent" WHERE "linkId" IN (SELECT id FROM "Link" WHERE "workspaceId" = ${ws})
    GROUP BY 1, 2`;

  await prisma.auditLog.create({ data: { actorId: admin.id, action: 'link.disable', entity: 'link', entityId: (await prisma.link.findUnique({ where: { codeLower: 'free-gift' } })).id, data: { code: 'free-gift', reason: 'Reported as phishing — credential harvesting page' } } });

  console.log(`Seeded ${links.length} links and ${allClicks} clicks.`);
  console.log(`Admin: ${adminEmail} (password from ADMIN_PASSWORD)`);
  console.log(`Demo:  ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main().catch(err => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
