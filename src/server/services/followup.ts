import { and, eq, isNull, inArray } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { distributorLeads } from '@/server/db/schema/crm';
import { employees } from '@/server/db/schema/identity';
import { OPEN_STAGES } from '@/domain/pipeline';
import { classifyFollowUp, isHotLead, needsNextAction } from '@/domain/followup';
import { getConfig } from './config';

export type LeadLite = {
  id: string;
  businessName: string;
  stage: string;
  grade: string;
  probability: number;
  nextFollowUpAt: string | null;
  assignee: string | null;
  assignedEmployeeId: string | null;
};

export async function getFollowUpBuckets(
  orgId: string,
  opts: { assignedEmployeeId?: string; now?: Date } = {},
): Promise<{
  overdue: LeadLite[];
  today: LeadLite[];
  next7: LeadLite[];
  noAction: LeadLite[];
  hotNoAction: LeadLite[];
}> {
  const now = opts.now ?? new Date();
  const hotThreshold = await getConfig(orgId, 'hotLeadProbabilityThreshold');
  const conds = [
    eq(distributorLeads.orgId, orgId),
    isNull(distributorLeads.deletedAt),
    inArray(distributorLeads.stage, OPEN_STAGES),
  ];
  if (opts.assignedEmployeeId) conds.push(eq(distributorLeads.assignedEmployeeId, opts.assignedEmployeeId));

  const rows = await db
    .select({
      id: distributorLeads.id,
      businessName: distributorLeads.businessName,
      stage: distributorLeads.stage,
      grade: distributorLeads.grade,
      probability: distributorLeads.probability,
      nextFollowUpAt: distributorLeads.nextFollowUpAt,
      assignee: employees.name,
      assignedEmployeeId: distributorLeads.assignedEmployeeId,
    })
    .from(distributorLeads)
    .leftJoin(employees, eq(employees.id, distributorLeads.assignedEmployeeId))
    .where(and(...conds));

  const lite = (r: (typeof rows)[number]): LeadLite => ({
    ...r,
    nextFollowUpAt: r.nextFollowUpAt ? r.nextFollowUpAt.toISOString() : null,
  });

  const overdue: LeadLite[] = [];
  const today: LeadLite[] = [];
  const next7: LeadLite[] = [];
  const noAction: LeadLite[] = [];
  const hotNoAction: LeadLite[] = [];
  const in7 = new Date(now.getTime() + 7 * 86_400_000);

  for (const r of rows) {
    const bucket = classifyFollowUp(r.nextFollowUpAt, now);
    if (bucket === 'OVERDUE') overdue.push(lite(r));
    else if (bucket === 'TODAY') today.push(lite(r));
    else if (bucket === 'UPCOMING' && r.nextFollowUpAt && r.nextFollowUpAt <= in7) next7.push(lite(r));

    if (needsNextAction({ stage: r.stage as never, nextFollowUpAt: r.nextFollowUpAt })) {
      noAction.push(lite(r));
      if (isHotLead({ grade: r.grade, probability: r.probability, stage: r.stage as never, hotThreshold })) {
        hotNoAction.push(lite(r));
      }
    }
  }

  return { overdue, today, next7, noAction, hotNoAction };
}
