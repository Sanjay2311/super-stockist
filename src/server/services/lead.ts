import { and, desc, eq, ilike, isNull, or } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { distributorLeads } from '@/server/db/schema/crm';
import { leadSchema, scoreInputsSchema } from '@/lib/schemas';
import { assertCan } from '@/server/auth/permissions';
import { getConfig } from './config';
import { scoreDistributor, assertWeightsValid, type ScoreWeights } from '@/domain/scoring';
import { writeAudit } from './audit';
import type { AppUser } from '@/server/auth/session';
import type { LeadStage } from '@/domain/pipeline';
import type { z } from 'zod';

export type LeadRow = typeof distributorLeads.$inferSelect;
// Callers supply raw form values; defaults/coercion are applied by `leadSchema.parse`.
export type LeadInput = z.input<typeof leadSchema>;

function clean<T extends Record<string, unknown>>(input: T): T {
  // drop empty-string optionals so they store as null
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) out[k] = v === '' ? null : v;
  return out as T;
}

export async function createLead(user: AppUser, input: LeadInput): Promise<LeadRow> {
  assertCan(user, 'lead.create');
  const data = leadSchema.parse(input);
  const assignedEmployeeId = data.assignedEmployeeId
    ?? (user.role === 'SALES' ? user.employeeId : null);
  const [row] = await db.insert(distributorLeads)
    .values({ ...clean(data), assignedEmployeeId, orgId: user.orgId })
    .returning();
  await writeAudit(user, 'lead', row.id, 'create', null, row);
  return row;
}

export async function updateLead(user: AppUser, id: string, input: Partial<LeadInput>): Promise<LeadRow> {
  assertCan(user, 'lead.update');
  const [before] = await db.select().from(distributorLeads)
    .where(and(eq(distributorLeads.id, id), eq(distributorLeads.orgId, user.orgId)));
  if (!before) throw new Error('not found');
  const data = leadSchema.partial().parse(input);
  const [row] = await db.update(distributorLeads)
    .set({ ...clean(data), updatedAt: new Date() })
    .where(eq(distributorLeads.id, id)).returning();
  await writeAudit(user, 'lead', id, 'update', before, row);
  return row;
}

export async function rescoreLead(user: AppUser, id: string, scoreInputs: unknown): Promise<LeadRow> {
  assertCan(user, 'lead.update');
  const inputs = scoreInputsSchema.parse(scoreInputs);
  const weights = (await getConfig(user.orgId, 'scoreWeights')) as ScoreWeights;
  assertWeightsValid(weights);
  const { score, grade } = scoreDistributor(inputs, weights);
  const [before] = await db.select().from(distributorLeads)
    .where(and(eq(distributorLeads.id, id), eq(distributorLeads.orgId, user.orgId)));
  if (!before) throw new Error('not found');
  const [row] = await db.update(distributorLeads)
    .set({ scoreInputs: inputs, score, grade, updatedAt: new Date() })
    .where(eq(distributorLeads.id, id)).returning();
  await writeAudit(user, 'lead', id, 'rescore', { score: before.score, grade: before.grade }, { score, grade });
  return row;
}

export async function listLeads(orgId: string, opts: {
  stage?: LeadStage; assignedEmployeeId?: string; q?: string; limit?: number; offset?: number;
} = {}): Promise<LeadRow[]> {
  const conds = [eq(distributorLeads.orgId, orgId), isNull(distributorLeads.deletedAt)];
  if (opts.stage) conds.push(eq(distributorLeads.stage, opts.stage));
  if (opts.assignedEmployeeId) conds.push(eq(distributorLeads.assignedEmployeeId, opts.assignedEmployeeId));
  if (opts.q) {
    const like = `%${opts.q}%`;
    conds.push(or(ilike(distributorLeads.businessName, like), ilike(distributorLeads.contactPerson, like), ilike(distributorLeads.phone, like))!);
  }
  return db.select().from(distributorLeads).where(and(...conds))
    .orderBy(desc(distributorLeads.updatedAt))
    .limit(opts.limit ?? 50).offset(opts.offset ?? 0);
}

export async function getLead(orgId: string, id: string): Promise<LeadRow | null> {
  const [row] = await db.select().from(distributorLeads)
    .where(and(eq(distributorLeads.id, id), eq(distributorLeads.orgId, orgId)));
  return row ?? null;
}
