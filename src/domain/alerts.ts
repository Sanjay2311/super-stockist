// src/domain/alerts.ts
export type Severity = 'critical' | 'attention' | 'positive';

export interface AlertCandidate {
  category: string;
  severity: Severity;
  title: string;
  body?: string;
  entityType: string;
  entityId: string;
  targetUserId?: string | null;
}

export function followUpOverdueAlert(i: {
  leadId: string; businessName: string; daysOverdue: number; assignedEmployeeId: string | null;
}): AlertCandidate {
  return {
    category: 'follow_up_overdue',
    severity: i.daysOverdue >= 3 ? 'critical' : 'attention',
    title: `${i.businessName}: follow-up overdue`,
    body: `${i.daysOverdue} day(s) overdue`,
    entityType: 'lead', entityId: i.leadId, targetUserId: i.assignedEmployeeId,
  };
}

export function quotationStaleAlert(i: {
  quotationId: string; quoteNo: string; daysSinceSent: number; employeeId: string | null;
}): AlertCandidate {
  return {
    category: 'quotation_stale',
    severity: 'attention',
    title: `${i.quoteNo}: awaiting response`,
    body: `Sent ${i.daysSinceSent} day(s) ago, no status change yet`,
    entityType: 'quotation', entityId: i.quotationId, targetUserId: i.employeeId,
  };
}

export function distributorReviewDueAlert(i: {
  distributorId: string; businessName: string; daysOverdue: number;
}): AlertCandidate {
  return {
    category: 'distributor_review_due',
    severity: i.daysOverdue > 0 ? 'critical' : 'attention',
    title: `${i.businessName}: review ${i.daysOverdue > 0 ? 'overdue' : 'due today'}`,
    entityType: 'distributor', entityId: i.distributorId,
  };
}

export function inactiveDistributorAlert(i: { distributorId: string; businessName: string }): AlertCandidate {
  return {
    category: 'inactive_distributor',
    severity: 'attention',
    title: `${i.businessName}: marked temporarily inactive`,
    entityType: 'distributor', entityId: i.distributorId,
  };
}

export function emptyTerritoryAlert(i: { territoryId: string; name: string }): AlertCandidate {
  return {
    category: 'empty_territory',
    severity: 'attention',
    title: `${i.name}: no distributors yet`,
    entityType: 'territory', entityId: i.territoryId,
  };
}

export function missingDailyReportAlert(i: {
  employeeId: string; employeeName: string; date: string;
}): AlertCandidate {
  return {
    category: 'missing_daily_report',
    severity: 'attention',
    title: `${i.employeeName}: no daily report for ${i.date}`,
    entityType: 'employee', entityId: i.employeeId, targetUserId: null,
  };
}

export function newDistributorAppointedAlert(i: { distributorId: string; businessName: string }): AlertCandidate {
  return {
    category: 'new_distributor',
    severity: 'positive',
    title: `${i.businessName}: appointed as a new distributor`,
    entityType: 'distributor', entityId: i.distributorId,
  };
}
