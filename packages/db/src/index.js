import { PrismaClient } from '@prisma/client';

// One client per process; Prisma pools connections internally.
const globalKey = Symbol.for('linkpulse.prisma');
export const prisma = globalThis[globalKey] ?? (globalThis[globalKey] = new PrismaClient());

export * from '@prisma/client';
