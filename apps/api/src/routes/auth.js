import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@linkpulse/db';
import { parse, conflict, unauthorized } from '../lib/http.js';
import { setSession, clearSession, requireUser } from '../plugins/auth.js';

const Register = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(60),
  email: z.string().trim().toLowerCase().email('Enter a valid email.'),
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
});
const Login = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

const publicUser = u => ({ id: u.id, email: u.email, name: u.name, role: u.role });

export async function authRoutes(app) {
  app.post('/api/auth/register', async (req, reply) => {
    const body = parse(Register, req.body);
    if (await prisma.user.findUnique({ where: { email: body.email } })) throw conflict('An account with this email already exists.');
    const user = await prisma.user.create({
      data: {
        email: body.email, name: body.name, passwordHash: await bcrypt.hash(body.password, 11),
        memberships: { create: { workspace: { create: { name: `${body.name.split(' ')[0]}'s workspace` } } } },
      },
    });
    setSession(reply, user);
    return reply.code(201).send({ user: publicUser(user) });
  });

  app.post('/api/auth/login', async (req, reply) => {
    const body = parse(Login, req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    // Compare even when the user is missing so response time does not reveal which emails exist.
    const ok = await bcrypt.compare(body.password, user?.passwordHash ?? '$2a$11$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    if (!user || !ok) throw unauthorized('Email or password is incorrect.');
    setSession(reply, user);
    return { user: publicUser(user) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    clearSession(reply);
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: requireUser }, async req => ({ user: req.user }));
}
