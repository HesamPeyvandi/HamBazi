import { db, schema } from '@/db/client';

export async function audit(actorId: string | null, action: string, entity: string, entityId?: string, diff?: unknown) {
  await db().insert(schema.auditLogs).values({ actorId, action, entity, entityId, diff: diff as never });
}
