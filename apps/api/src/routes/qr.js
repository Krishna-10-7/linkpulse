import QRCode from 'qrcode';
import { z } from 'zod';
import { prisma } from '@linkpulse/db';
import { shortUrl } from '@linkpulse/runtime';
import { requireUser, ownerScope } from '../plugins/auth.js';
import { parse, notFound } from '../lib/http.js';

// QR codes encode the short link with ?src=qr, so scans are counted apart from clicks.

const hex = z.string().regex(/^[0-9a-fA-F]{6}$/).transform(v => `#${v}`);
const Style = z.object({
  fg: hex.default('15161c'),
  bg: hex.default('ffffff'),
  size: z.coerce.number().int().min(128).max(2048).default(512),
  margin: z.coerce.number().int().min(0).max(8).default(2),
  download: z.enum(['0', '1']).default('0'),
});

export async function qrRoutes(app) {
  app.addHook('preHandler', requireUser);

  app.get('/api/links/:id/qr.:format', async (req, reply) => {
    const format = req.params.format;
    if (format !== 'svg' && format !== 'png') throw notFound();
    const link = await prisma.link.findFirst({ where: { id: req.params.id, ...ownerScope(req.user) }, select: { code: true } });
    if (!link) throw notFound('Link not found.');
    const s = parse(Style, req.query);
    const url = `${shortUrl(link.code)}?src=qr`;
    const opts = { errorCorrectionLevel: 'M', margin: s.margin, color: { dark: s.fg, light: s.bg }, width: s.size };
    if (s.download === '1') reply.header('content-disposition', `attachment; filename="linkpulse-${link.code}.${format}"`);
    reply.header('cache-control', 'private, max-age=300');
    if (format === 'svg') return reply.type('image/svg+xml').send(await QRCode.toString(url, { ...opts, type: 'svg' }));
    return reply.type('image/png').send(await QRCode.toBuffer(url, opts));
  });
}
