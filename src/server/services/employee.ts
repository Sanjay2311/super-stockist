import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { employees } from '@/server/db/schema/identity';

export type EmployeeRow = typeof employees.$inferSelect;

export async function listEmployees(
  orgId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<EmployeeRow[]> {
  const conds = [eq(employees.orgId, orgId)];
  if (opts.activeOnly) conds.push(eq(employees.status, 'active'));
  return db.select().from(employees).where(and(...conds)).orderBy(asc(employees.name));
}
