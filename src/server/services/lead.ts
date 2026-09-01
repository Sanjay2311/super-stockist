import { and, desc, eq, ilike, isNull, or } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { distributorLeads } from '@/server/db/schema/crm';
import { territories } from '@/server/db/schema/territory';
import { employees } from '@/server/db/schema/identity';
import { leadSchema, scoreInputsSchema } from '@/lib/schemas';
import { assertCan } from '@/server/auth/permissions';
import { getConfig } from './config';
import { scoreDistributor, assertWeightsValid, type ScoreWeights } from '@/domain/scoring';
import { writeAudit } from './audit';
import { addActivity } from './activity';
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

export async function setStage(
  user: AppUser,
  id: string,
  stage: LeadStage,
  opts: { probability?: number; lostReason?: string; lostNotes?: string; onHoldReason?: string } = {},
): Promise<LeadRow> {
  assertCan(user, 'lead.setStage');
  if (stage === 'LOST' && !opts.lostReason) throw new Error('lostReason required');
  const [before] = await db.select().from(distributorLeads)
    .where(and(eq(distributorLeads.id, id), eq(distributorLeads.orgId, user.orgId)));
  if (!before) throw new Error('not found');
  const probMap = await getConfig(user.orgId, 'stageProbability');
  const probability = opts.probability ?? probMap[stage];
  const [row] = await db.update(distributorLeads).set({
    stage,
    probability,
    lostReason: stage === 'LOST' ? opts.lostReason ?? null : null,
    lostNotes: stage === 'LOST' ? opts.lostNotes ?? null : null,
    onHoldReason: stage === 'ON_HOLD' ? opts.onHoldReason ?? null : null,
    updatedAt: new Date(),
  }).where(eq(distributorLeads.id, id)).returning();
  await addActivity(user, { leadId: id, type: 'OTHER', outcome: `Stage: ${before.stage} → ${stage}` });
  await writeAudit(user, 'lead', id, 'setStage',
    { stage: before.stage, probability: before.probability }, { stage, probability });
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

/** Read model for the pipeline Kanban board — one row per open lead, joins resolved,
 *  `nextFollowUpAt` serialized to an ISO string so it crosses the RSC → client boundary. */
export type BoardLead = {
  id: string;
  businessName: string;
  territoryName: string | null;
  expectedFfMonthlyPotential: number;
  score: number;
  grade: string;
  probability: number;
  stage: LeadStage;
  nextFollowUpAt: string | null;
  assignee: string | null;
};

export async function boardLeads(orgId: string): Promise<BoardLead[]> {
  const rows = await db.select({
    id: distributorLeads.id,
    businessName: distributorLeads.businessName,
    territoryName: territories.name,
    expectedFfMonthlyPotential: distributorLeads.expectedFfMonthlyPotential,
    score: distributorLeads.score,
    grade: distributorLeads.grade,
    probability: distributorLeads.probability,
    stage: distributorLeads.stage,
    nextFollowUpAt: distributorLeads.nextFollowUpAt,
    assignee: employees.name,
  }).from(distributorLeads)
    .leftJoin(territories, eq(territories.id, distributorLeads.territoryId))
    .leftJoin(employees, eq(employees.id, distributorLeads.assignedEmployeeId))
    .where(and(eq(distributorLeads.orgId, orgId), isNull(distributorLeads.deletedAt)));

  return rows.map((r) => ({
    ...r,
    stage: r.stage as LeadStage,
    nextFollowUpAt: r.nextFollowUpAt ? r.nextFollowUpAt.toISOString() : null,
  }));
}

export async function getLead(orgId: string, id: string): Promise<LeadRow | null> {
  const [row] = await db.select().from(distributorLeads)
    .where(and(eq(distributorLeads.id, id), eq(distributorLeads.orgId, orgId)));
  return row ?? null;
}
