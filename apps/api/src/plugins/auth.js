import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '@linkpulse/db';
import { config } from '@linkpulse/runtime';
import { unauthorized, forbidden } from '../lib/http.js';

// Two ways in: the dashboard's HTTP-only session cookie, or a personal access token
// (Authorization: Bearer lp_…) used by the browser extension.

export const SESSION_COOKIE = 'lp_session';
const SESSION_DAYS = 7;

export const hashToken = token => createHash('sha256').update(token).digest('hex');

export function setSession(reply, user) {
  const token = jwt.sign({ sub: user.id, role: user.role }, config.sessionSecret, { expiresIn: `${SESSION_DAYS}d` });
  reply.setCookie(SESSION_COOKIE, token, {
    path: config.basePath || '/', httpOnly: true, sameSite: 'lax', secure: config.production, maxAge: SESSION_DAYS * 86400,
  });
}

export function clearSession(reply) {
  reply.clearCookie(SESSION_COOKIE, { path: config.basePath || '/' });
}

async function loadUser(id) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, memberships: { select: { workspaceId: true }, take: 1 } },
  });
  if (!user) return null;
  const { memberships, ...rest } = user;
  return { ...rest, workspaceId: memberships[0]?.workspaceId ?? null };
}

export async function authPlugin(app) {
  app.decorateRequest('user', null);
  app.addHook('onRequest', async req => {
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer lp_')) {
      const token = await prisma.apiToken.findUnique({ where: { tokenHash: hashToken(header.slice(7)) } });
      if (token) {
        req.user = await loadUser(token.userId);
        prisma.apiToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
      }
      return;
    }
    const cookie = req.cookies?.[SESSION_COOKIE];
    if (!cookie) return;
    try {
      const payload = jwt.verify(cookie, config.sessionSecret);
      req.user = await loadUser(payload.sub);
    } catch { /* expired or tampered: treat as signed out */ }
  });
}

/** preHandlers */
export async function requireUser(req) {
  if (!req.user) throw unauthorized();
}
export async function requireAdmin(req) {
  if (!req.user) throw unauthorized();
  if (req.user.role !== 'ADMIN') throw forbidden('Admins only.');
}

/** Every query for user-owned data goes through this filter, so a missing check cannot leak data. */
export function ownerScope(user) {
  return user.role === 'ADMIN' ? {} : { ownerId: user.id };
}
