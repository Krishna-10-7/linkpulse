// Recompute every daily rollup from the raw click events in APP_TIMEZONE.
// Run once after changing the time zone; the worker keeps rollups current afterwards.
//
//   npm run db:rollups

import { prisma } from './index.js';

const tz = process.env.APP_TIMEZONE || 'Asia/Kolkata';

await prisma.$transaction(async tx => {
  await tx.$executeRaw`DELETE FROM "ClickDaily"`;
  await tx.$executeRaw`
    INSERT INTO "ClickDaily" ("linkId", "day", "clicks", "uniques", "bots", "qr")
    SELECT "linkId", (("ts" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date,
           COUNT(*) FILTER (WHERE NOT "isBot"), COUNT(*) FILTER (WHERE "isUnique"),
           COUNT(*) FILTER (WHERE "isBot"), COUNT(*) FILTER (WHERE "viaQr" AND NOT "isBot")
    FROM "ClickEvent" GROUP BY 1, 2`;
});
const n = await prisma.clickDaily.count();
console.log(`Rebuilt ${n} daily rollups in ${tz}.`);
await prisma.$disconnect();
