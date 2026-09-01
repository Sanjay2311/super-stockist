import { and, asc, eq, ilike, isNull, or } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { distributors } from '@/server/db/schema/distributor';
import { distributorSchema, type DistributorInput } from '@/lib/schemas';
import { patchOnly } from '@/lib/patch';
import { assertCan, stripFinancial } from '@/server/auth/permissions';
import { overlapsExclusive } from './territory';
import { writeAudit } from './audit';
import type { AppUser } from '@/server/auth/session';

export type DistributorRow = typeof distributors.$inferSelect;

// No cost columns on a distributor read in M2b. Kept as the redaction hook so a
// future cost/margin field is added here AND every wired read path stays covered.
export const DISTRIBUTOR_FINANCIAL_FIELDS: (keyof DistributorRow)[] = [];

export function redactDistributor(user: AppUser, row: DistributorRow): DistributorRow {
  return stripFinancial(user, row, DISTRIBUTOR_FINANCIAL_FIELDS);
}
export function redactDistributors(user: AppUser, rows: DistributorRow[]): DistributorRow[] {
  return rows.map((r) => redactDistributor(user, r));
}

function clean<T extends Record<string, unknown>>(input: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) out[k] = v === '' ? null : v;
  return out as T;
}

export async function listDistributors(
  orgId: string,
  opts: { status?: string; territoryId?: string; q?: string } = {},
): Promise<DistributorRow[]> {
  const conds = [eq(distributors.orgId, orgId), isNull(distributors.deletedAt)];
  if (opts.status) conds.push(eq(distributors.status, opts.status));
  if (opts.territoryId) conds.push(eq(distributors.territoryId, opts.territoryId));
  if (opts.q) {
    const like = `%${opts.q}%`;
    conds.push(or(ilike(distributors.businessName, like), ilike(distributors.contactPerson, like), ilike(distributors.phone, like))!);
  }
  return db.select().from(distributors).where(and(...conds)).orderBy(asc(distributors.businessName));
}

export async function getDistributor(orgId: string, id: string): Promise<DistributorRow | null> {
  const [row] = await db.select().from(distributors)
    .where(and(eq(distributors.id, id), eq(distributors.orgId, orgId), isNull(distributors.deletedAt)));
  return row ?? null;
}

export async function updateDistributor(
  user: AppUser,
  id: string,
  input: Partial<DistributorInput>,
): Promise<DistributorRow> {
  assertCan(user, 'distributor.edit');
  const [before] = await db.select().from(distributors)
    .where(and(eq(distributors.id, id), eq(distributors.orgId, user.orgId)));
  if (!before) throw new Error('not found');

  const { overrideReason, ...rest } = input;
  const data = patchOnly(rest, distributorSchema.omit({ overrideReason: true }).partial().parse(rest));

  const nextTerritoryId = 'territoryId' in data ? (data.territoryId ?? null) : before.territoryId;
  const nextExclusive = 'exclusive' in data ? !!data.exclusive : before.exclusive;
  const nextStatus = 'status' in data ? data.status! : before.status;
  const territoryOrExclusivityChanged =
    nextTerritoryId !== before.territoryId || nextExclusive !== before.exclusive;

  let exclusivityNote: string | null | undefined;
  if (nextExclusive && nextTerritoryId && territoryOrExclusivityChanged
      && ['APPROVED', 'ACTIVE'].includes(nextStatus)) {
    const clash = await overlapsExclusive(user.orgId, nextTerritoryId, id);
    if (clash) {
      if (!overrideReason) throw new Error('EXCLUSIVITY_CONFLICT');
      exclusivityNote = overrideReason;
    }
  }

  const [row] = await db.update(distributors).set({
    ...clean(data),
    ...(exclusivityNote !== undefined ? { exclusivityNote } : {}),
    updatedAt: new Date(),
  }).where(eq(distributors.id, id)).returning();

  await writeAudit(user, 'distributor', id, exclusivityNote ? 'exclusivity_override' : 'update', before, row);
  return row;
}
