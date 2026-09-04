import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { distributorLeads, employeeDailyReports } from '@/server/db/schema/crm';
import { distributors } from '@/server/db/schema/distributor';
import { territories } from '@/server/db/schema/territory';
import { employees } from '@/server/db/schema/identity';
import { quotations, quotationItems } from '@/server/db/schema/quotation';
import type { ReportFilters } from '@/lib/filters';
import { listScorecards, type EmployeeScorecard } from './scorecard';

export async function pipelineReport(orgId: string, filters: ReportFilters) {
  const conds = [eq(distributorLeads.orgId, orgId), isNull(distributorLeads.deletedAt)];
  if (filters.territoryId) conds.push(eq(distributorLeads.territoryId, filters.territoryId));
  if (filters.employeeId) conds.push(eq(distributorLeads.assignedEmployeeId, filters.employeeId));
  const rows = await db.select({
    stage: distributorLeads.stage, lostReason: distributorLeads.lostReason,
    territoryName: territories.name, employeeName: employees.name,
  }).from(distributorLeads)
    .leftJoin(territories, eq(territories.id, distributorLeads.territoryId))
    .leftJoin(employees, eq(employees.id, distributorLeads.assignedEmployeeId))
    .where(and(...conds));

  const count = <T,>(rows: T[], key: (r: T) => string | null) => {
    const m = new Map<string | null, number>();
    for (const r of rows) { const k = key(r); m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  };
  const byStageMap = count(rows, (r) => r.stage);
  const byTerritoryMap = count(rows, (r) => r.territoryName);
  const byEmployeeMap = count(rows, (r) => r.employeeName);
  const lossMap = count(rows.filter((r) => r.stage === 'LOST'), (r) => r.lostReason);

  return {
    byStage: [...byStageMap].map(([stage, count]) => ({ stage: stage!, count })),
    byTerritory: [...byTerritoryMap].map(([territoryName, count]) => ({ territoryName, count })),
    byEmployee: [...byEmployeeMap].map(([employeeName, count]) => ({ employeeName, count })),
    lossReasons: [...lossMap].map(([reason, count]) => ({ reason: reason!, count })),
  };
}

export async function quotationsReport(orgId: string, filters: ReportFilters) {
  const conds = [eq(quotations.orgId, orgId), isNull(quotations.deletedAt)];
  if (filters.employeeId) conds.push(eq(quotations.employeeId, filters.employeeId));
  const rows = await db.select({
    status: quotations.status, employeeId: quotations.employeeId, employeeName: employees.name,
    distributorId: quotations.distributorId, distributorName: distributors.businessName,
    quotationId: quotations.id, netAmount: quotationItems.netAmount,
  }).from(quotations)
    .leftJoin(employees, eq(employees.id, quotations.employeeId))
    .leftJoin(distributors, eq(distributors.id, quotations.distributorId))
    .leftJoin(quotationItems, eq(quotationItems.quotationId, quotations.id))
    .where(and(...conds));

  type Agg = { count: Set<string>; value: number };
  const bump = (m: Map<string, Agg>, key: string, quotationId: string, amount: number) => {
    const agg = m.get(key) ?? { count: new Set(), value: 0 };
    agg.count.add(quotationId); agg.value += amount;
    m.set(key, agg);
  };
  const byStatus = new Map<string, Agg>();
  const byDistributor = new Map<string, Agg>();
  const byEmployee = new Map<string, Agg>();
  for (const r of rows) {
    const amount = r.netAmount ?? 0;
    bump(byStatus, r.status, r.quotationId, amount);
    if (r.distributorName) bump(byDistributor, r.distributorName, r.quotationId, amount);
    bump(byEmployee, r.employeeName ?? '—', r.quotationId, amount);
  }
  const toArr = (m: Map<string, Agg>) => [...m].map(([key, agg]) => ({ key, count: agg.count.size, value: agg.value }));
  return {
    byStatus: toArr(byStatus).map((r) => ({ status: r.key, count: r.count, value: r.value })),
    byDistributor: toArr(byDistributor).map((r) => ({ businessName: r.key, count: r.count, value: r.value })),
    byEmployee: toArr(byEmployee).map((r) => ({ employeeName: r.key, count: r.count, value: r.value })),
  };
}

export async function employeesReport(orgId: string, filters: ReportFilters): Promise<EmployeeScorecard[]> {
  const to = filters.to ? new Date(filters.to) : new Date();
  const from = filters.from ? new Date(filters.from) : new Date(to.getTime() - 6 * 86_400_000);
  return listScorecards(orgId, from, to, { employeeId: filters.employeeId ?? undefined });
}

export async function distributorsReport(orgId: string, filters: ReportFilters) {
  const conds = [eq(distributors.orgId, orgId), isNull(distributors.deletedAt)];
  if (filters.territoryId) conds.push(eq(distributors.territoryId, filters.territoryId));
  const rows = await db.select({
    status: distributors.status, grade: distributors.grade, territoryName: territories.name,
  }).from(distributors).leftJoin(territories, eq(territories.id, distributors.territoryId)).where(and(...conds));

  const count = <T,>(rows: T[], key: (r: T) => string | null) => {
    const m = new Map<string | null, number>();
    for (const r of rows) { const k = key(r); m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  };
  const byStatus = [...count(rows, (r) => r.status)].map(([status, count]) => ({ status: status!, count }));
  const byGrade = [...count(rows, (r) => r.grade)].map(([grade, count]) => ({ grade, count }));
  const byTerritory = [...count(rows, (r) => r.territoryName)].map(([territoryName, count]) => ({ territoryName, count }));

  const emps = await db.select({ id: employees.id, name: employees.name }).from(employees)
    .where(and(eq(employees.orgId, orgId), eq(employees.status, 'active')));
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const submittedRows = await db.select({ employeeId: employeeDailyReports.employeeId }).from(employeeDailyReports)
    .where(and(eq(employeeDailyReports.orgId, orgId), eq(employeeDailyReports.reportDate, yesterday)));
  const submittedSet = new Set(submittedRows.map((r) => r.employeeId));
  const dailyReportCompliance = emps.map((e) => ({
    employeeName: e.name, submitted: submittedSet.has(e.id) ? 1 : 0, expected: 1,
  }));

  return { byStatus, byGrade, byTerritory, dailyReportCompliance };
}
