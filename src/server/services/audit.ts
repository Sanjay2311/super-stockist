import { db } from '@/server/db/client';
import { auditLog } from '@/server/db/schema/audit';
import type { AppUser } from '@/server/auth/session';

/**
 * Append-only audit trail. Called by services after a mutation, with the row
 * before and after so a diff can be reconstructed later.
 */
export async function writeAudit(
  user: AppUser,
  entityType: string,
  entityId: string,
  action: string,
  oldValues: unknown,
  newValues: unknown,
): Promise<void> {
  await db.insert(auditLog).values({
    orgId: user.orgId,
    userId: user.id,
    entityType,
    entityId,
    action,
    oldValues: oldValues ?? null,
    newValues: newValues ?? null,
  });
}
