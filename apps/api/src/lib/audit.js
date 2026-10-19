import { prisma } from '@linkpulse/db';

/** Every admin action is written here: who did what to which record, with before/after values. */
export function audit(actorId, action, entity, entityId, data) {
  return prisma.auditLog.create({ data: { actorId, action, entity, entityId, data: data ?? undefined } }).catch(() => {});
}
