import { and, asc, eq, ilike, isNull, or } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { distributors } from '@/server/db/schema/distributor';
import { distributorLeads } from '@/server/db/schema/crm';
import {
  distributorSchema,
  type DistributorInput,
  convertLeadSchema,
  type ConvertLeadInput,
  DISTRIBUTOR_GRADES,
} from '@/lib/schemas';
import { patchOnly } from '@/lib/patch';
import { assertCan, stripFinancial } from '@/server/auth/permissions';
import { overlapsExclusive } from './territory';
import { writeAudit } from './audit';
import { getConfig } from './config';
import { getLead } from './lead';
import { addActivity } from './activity';
import { createNotification } from './notification';
import { newDistributorAppointedAlert } from '@/domain/alerts';
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

  // spec §4.4/§13: the trigger is *assigning a territory held exclusively by
  // another active distributor* — the incoming party's own `exclusive` flag is
  // irrelevant (#2). And entering a blocking status must re-check the current
  // territory even when nothing else changed on this save (#3).
  const wasBlocking = ['APPROVED', 'ACTIVE'].includes(before.status);
  const isBlocking = ['APPROVED', 'ACTIVE'].includes(nextStatus);
  const needsExclusivityCheck =
    isBlocking && (territoryOrExclusivityChanged || !wasBlocking);

  let exclusivityNote: string | null | undefined;
  if (needsExclusivityCheck && nextTerritoryId) {
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

const CONVERTIBLE_STAGES = ['APPROVED', 'APPOINTED'];
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function convertLead(
  user: AppUser,
  leadId: string,
  input: ConvertLeadInput,
): Promise<DistributorRow> {
  assertCan(user, 'distributor.create');
  const form = convertLeadSchema.parse(input);

  const lead = await getLead(user.orgId, leadId);
  if (!lead) throw new Error('not found');
  if (!CONVERTIBLE_STAGES.includes(lead.stage) || lead.convertedDistributorId) {
    throw new Error('LEAD_NOT_CONVERTIBLE');
  }

  // §13: clash is triggered by assigning a territory another active exclusive
  // distributor holds — the new party's own `exclusive` flag is irrelevant (#2).
  // A converted lead is always created APPROVED (a blocking status).
  let exclusivityNote: string | null = null;
  if (form.territoryId) {
    const clash = await overlapsExclusive(user.orgId, form.territoryId);
    if (clash) {
      if (!form.overrideReason) throw new Error('EXCLUSIVITY_CONFLICT');
      if (user.role !== 'OWNER') throw new Error('EXCLUSIVITY_OVERRIDE_REQUIRES_OWNER');
      exclusivityNote = form.overrideReason;
    }
  }

  const grade = DISTRIBUTOR_GRADES.includes(lead.grade as (typeof DISTRIBUTOR_GRADES)[number])
    ? lead.grade : null;

  const [row] = await db.insert(distributors).values({
    orgId: user.orgId,
    businessName: lead.businessName,
    contactPerson: lead.contactPerson,
    phone: lead.phone,
    email: lead.email,
    address: lead.address,
    territoryId: form.territoryId ?? null,
    exclusive: !!form.exclusive,
    exclusivityNote,
    assignedEmployeeId: form.assignedEmployeeId ?? lead.assignedEmployeeId ?? null,
    appointmentDate: ymd(new Date()),
    status: 'APPROVED',
    grade,
    creditLimit: form.creditLimit ?? 0,
    creditDays: form.creditDays ?? 0,
    paymentTerms: form.paymentTerms || null,
    expectedMonthlyPurchase: form.expectedMonthlyPurchase ?? 0,
    sourceLeadId: leadId,
  }).returning();

  const nextStage = lead.stage === 'APPROVED' ? 'APPOINTED' : lead.stage;
  const probMap = await getConfig(user.orgId, 'stageProbability');
  const [leadAfter] = await db.update(distributorLeads).set({
    convertedDistributorId: row.id,
    stage: nextStage,
    probability: probMap[nextStage as keyof typeof probMap],
    updatedAt: new Date(),
  }).where(eq(distributorLeads.id, leadId)).returning();

  await addActivity(user, { leadId, type: 'OTHER', outcome: 'Converted to distributor' });
  await writeAudit(user, 'distributor', row.id, exclusivityNote ? 'exclusivity_override' : 'convert', { leadId }, row);
  await createNotification(
    user.orgId,
    newDistributorAppointedAlert({ distributorId: row.id, businessName: row.businessName }),
    ymd(new Date()),
  );
  await writeAudit(user, 'lead', leadId, 'convert',
    { stage: lead.stage, convertedDistributorId: null },
    { stage: leadAfter.stage, convertedDistributorId: row.id });
  return row;
}
