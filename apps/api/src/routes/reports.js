import { z } from 'zod';
import { prisma } from '@linkpulse/db';
import { config, invalidateLink } from '@linkpulse/runtime';
import { dailySalt, visitorHash } from '@linkpulse/core';
import { parse, notFound } from '../lib/http.js';
import { requireAdmin } from '../plugins/auth.js';
import { enforce } from '../lib/limit.js';
import { audit } from '../lib/audit.js';

// Auto-protect: this many open reports from different visitors pauses a link until an admin reviews it.
export const AUTO_PROTECT_REPORTS = 3;

const Report = z.object({
  code: z.string().trim().min(1).max(40),
  reason: z.enum(['phishing', 'malware', 'spam', 'other']).default('other'),
});

const thanks = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Thanks · LinkPulse</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f2ea;font:16px/1.5 system-ui,sans-serif;color:#15161c">
<main style="max-width:460px;background:#fffefb;border:2px solid #15161c;border-radius:22px;box-shadow:6px 6px 0 #15161c;padding:32px">
<h1 style="font:600 30px Georgia,serif;margin:0 0 10px">Thanks for the report.</h1><p>Our admins will review this link. If several people report it, it is paused automatically while we check.</p></main></body>`;

export async function reportRoutes(app) {
  // Public: visitors report from the preview or "disabled" pages. Works as a form post or JSON.
  app.post('/api/report', async (req, reply) => {
    const body = parse(Report, req.body);
    const reporter = visitorHash(req.ip, req.headers['user-agent'] || '', dailySalt(config.sessionSecret));
    await enforce('report', reporter);
    const link = await prisma.link.findUnique({ where: { codeLower: body.code.toLowerCase() } });
    if (!link) throw notFound('Link not found.');

    const already = await prisma.abuseReport.findFirst({ where: { linkId: link.id, reporterHash: reporter, status: 'OPEN' } });
    if (!already) await prisma.abuseReport.create({ data: { linkId: link.id, reason: body.reason, reporterHash: reporter } });

    const open = await prisma.abuseReport.count({ where: { linkId: link.id, status: 'OPEN' } });
    if (open >= AUTO_PROTECT_REPORTS && link.status === 'ACTIVE' && !link.flagged) {
      await prisma.link.update({ where: { id: link.id }, data: { status: 'PAUSED', flagged: true, disabledReason: `Auto-protect: ${open} abuse reports` } });
      await invalidateLink(link.codeLower);
      await audit(null, 'link.auto_protect', 'link', link.id, { code: link.code, reports: open });
    }
    if ((req.headers['content-type'] || '').includes('application/x-www-form-urlencoded')) return reply.type('text/html; charset=utf-8').send(thanks);
    return { ok: true };
  });

  app.get('/api/admin/reports', { preHandler: requireAdmin }, async req => {
    const status = ['OPEN', 'RESOLVED', 'DISMISSED'].includes(req.query.status) ? req.query.status : 'OPEN';
    const reports = await prisma.abuseReport.findMany({
      where: { status }, orderBy: { createdAt: 'desc' }, take: 200,
      include: { link: { select: { id: true, code: true, destination: true, status: true, flagged: true, owner: { select: { email: true } } } } },
    });
    // Group by link so the admin queue shows one row per reported link.
    const byLink = new Map();
    for (const r of reports) {
      const g = byLink.get(r.linkId) || { link: r.link, count: 0, reasons: {}, latest: r.createdAt, reportIds: [] };
      g.count++; g.reasons[r.reason] = (g.reasons[r.reason] || 0) + 1; g.reportIds.push(r.id);
      byLink.set(r.linkId, g);
    }
    return { items: [...byLink.values()].sort((a, b) => b.count - a.count) };
  });

  app.post('/api/admin/reports/dismiss', { preHandler: requireAdmin }, async req => {
    const { linkId } = parse(z.object({ linkId: z.string() }), req.body);
    const n = await prisma.abuseReport.updateMany({ where: { linkId, status: 'OPEN' }, data: { status: 'DISMISSED' } });
    await audit(req.user.id, 'reports.dismiss', 'link', linkId, { count: n.count });
    return { dismissed: n.count };
  });
}
