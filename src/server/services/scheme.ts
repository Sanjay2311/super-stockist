import { and, asc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { schemes } from '@/server/db/schema/scheme';
import { schemeSchema, type SchemeFormInput } from '@/lib/schemas';
import { assertCan } from '@/server/auth/permissions';
import { writeAudit } from './audit';
import type { SchemeDef } from '@/domain/scheme';
import type { AppUser } from '@/server/auth/session';

export type SchemeRow = typeof schemes.$inferSelect;

const ymd = (d: Date | string): string => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));

export function toSchemeDef(r: SchemeRow): SchemeDef {
  return {
    type: r.type as SchemeDef['type'],
    scopeType: r.scopeType as SchemeDef['scopeType'],
    scopeId: r.scopeId,
    startDate: ymd(r.startDate as unknown as string),
    endDate: ymd(r.endDate as unknown as string),
    minQty: r.minQty,
    minValue: r.minValue,
    benefit: r.benefit as SchemeDef['benefit'],
    eligibility: (r.eligibility ?? {}) as SchemeDef['eligibility'],
    active: r.active,
  };
}

// map the flat form shape to column values (benefit/eligibility become jsonb)
function toColumns(f: ReturnType<typeof schemeSchema.parse>) {
  return {
    name: f.name,
    type: f.type,
    scopeType: f.scopeType,
    scopeId: f.scopeType === 'ALL' ? null : (f.scopeId ?? null),
    startDate: ymd(f.startDate),
    endDate: ymd(f.endDate),
    minQty: f.minQty ?? null,
    minValue: f.minValue ?? null,
    benefit: { kind: f.benefitKind, value: f.benefitValue },
    eligibility: f.eligibleGrades.length ? { distributorGrades: f.eligibleGrades } : {},
    requiresApproval: f.requiresApproval ?? false,
    active: f.active ?? true,
  };
}

export async function listSchemes(orgId: string, opts: { activeOnly?: boolean } = {}): Promise<SchemeRow[]> {
  const conds = [eq(schemes.orgId, orgId), isNull(schemes.deletedAt)];
  if (opts.activeOnly) conds.push(eq(schemes.active, true));
  return db.select().from(schemes).where(and(...conds)).orderBy(asc(schemes.name));
}

export async function getScheme(orgId: string, id: string): Promise<SchemeRow | null> {
  const [row] = await db.select().from(schemes)
    .where(and(eq(schemes.id, id), eq(schemes.orgId, orgId), isNull(schemes.deletedAt)));
  return row ?? null;
}

export async function createScheme(user: AppUser, input: SchemeFormInput): Promise<SchemeRow> {
  assertCan(user, 'scheme.edit');
  const f = schemeSchema.parse(input);
  const [row] = await db.insert(schemes).values({ ...toColumns(f), orgId: user.orgId }).returning();
  await writeAudit(user, 'scheme', row.id, 'create', null, row);
  return row;
}

export async function updateScheme(user: AppUser, id: string, input: Partial<SchemeFormInput>): Promise<SchemeRow> {
  assertCan(user, 'scheme.edit');
  const [before] = await db.select().from(schemes).where(and(eq(schemes.id, id), eq(schemes.orgId, user.orgId)));
  if (!before) throw new Error('not found');
  // Re-parse a merged view so cross-field refinements still hold, then patch only supplied keys.
  const merged = schemeSchema.parse({
    name: input.name ?? before.name,
    type: input.type ?? before.type,
    scopeType: input.scopeType ?? before.scopeType,
    scopeId: 'scopeId' in input ? input.scopeId : before.scopeId,
    startDate: input.startDate ?? (before.startDate as unknown as string),
    endDate: input.endDate ?? (before.endDate as unknown as string),
    minQty: 'minQty' in input ? input.minQty : before.minQty,
    minValue: 'minValue' in input ? input.minValue : before.minValue,
    benefitKind: input.benefitKind ?? (before.benefit as { kind: string }).kind,
    benefitValue: input.benefitValue ?? (before.benefit as { value: number }).value,
    eligibleGrades: input.eligibleGrades
      ?? ((before.eligibility as { distributorGrades?: string[] }).distributorGrades ?? []),
    requiresApproval: 'requiresApproval' in input ? input.requiresApproval : before.requiresApproval,
    active: 'active' in input ? input.active : before.active,
  });
  const [row] = await db.update(schemes)
    .set({ ...toColumns(merged), updatedAt: new Date() })
    .where(eq(schemes.id, id)).returning();
  await writeAudit(user, 'scheme', id, 'update', before, row);
  return row;
}

export async function activeSchemesFor(
  orgId: string,
  ctx: { onDate: string; productId: string; categoryId: string | null },
): Promise<SchemeRow[]> {
  const scopeMatch = or(
    eq(schemes.scopeType, 'ALL'),
    and(eq(schemes.scopeType, 'PRODUCT'), eq(schemes.scopeId, ctx.productId)),
    ctx.categoryId ? and(eq(schemes.scopeType, 'CATEGORY'), eq(schemes.scopeId, ctx.categoryId)) : undefined,
  );
  return db.select().from(schemes).where(and(
    eq(schemes.orgId, orgId),
    isNull(schemes.deletedAt),
    eq(schemes.active, true),
    lte(schemes.startDate, ctx.onDate),
    gte(schemes.endDate, ctx.onDate),
    scopeMatch!,
  )).orderBy(asc(schemes.name));
}
