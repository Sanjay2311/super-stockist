import type { AppUser, Role } from './session';

export type Action =
  | 'lead.create' | 'lead.update' | 'lead.delete' | 'lead.setStage'
  | 'activity.create'
  | 'task.create' | 'task.update' | 'task.complete'
  | 'dailyReport.submit' | 'dailyReport.viewAll'
  | 'territory.view' | 'territory.edit'
  | 'product.view' | 'product.edit' | 'pricing.recommend'
  | 'config.view' | 'config.edit'
  | 'employee.manage'
  | 'dashboard.view';

const OWNER_ACTIONS: Action[] = [
  'lead.create', 'lead.update', 'lead.delete', 'lead.setStage',
  'activity.create', 'task.create', 'task.update', 'task.complete',
  'dailyReport.submit', 'dailyReport.viewAll',
  'territory.view', 'territory.edit',
  'product.view', 'product.edit', 'pricing.recommend',
  'config.view', 'config.edit',
  'employee.manage', 'dashboard.view',
];

const SALES_ACTIONS: Action[] = [
  'lead.create', 'lead.update', 'lead.setStage',
  'activity.create', 'task.create', 'task.update', 'task.complete',
  'dailyReport.submit', 'territory.view', 'product.view', 'config.view', 'dashboard.view',
];

const MATRIX: Record<Role, ReadonlySet<Action>> = {
  OWNER: new Set(OWNER_ACTIONS),
  SALES: new Set(SALES_ACTIONS),
};

export function can(user: AppUser, action: Action): boolean {
  return MATRIX[user.role].has(action);
}

export function assertCan(user: AppUser, action: Action): void {
  if (!can(user, action)) throw new Error('forbidden');
}

export function stripFinancial<T extends Record<string, unknown>>(
  user: AppUser, row: T, fields: (keyof T)[],
): T {
  if (user.role !== 'SALES') return row;
  const copy = { ...row };
  for (const f of fields) delete copy[f];
  return copy;
}
