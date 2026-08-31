import { describe, it, expect } from 'vitest';
import { can, assertCan, stripFinancial } from '@/server/auth/permissions';
import type { AppUser } from '@/server/auth/session';

const owner: AppUser = { id: 'o', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId: 'org' };
const sales: AppUser = { id: 's', email: 's', name: 'S', role: 'SALES', employeeId: 'e1', orgId: 'org' };

describe('permissions', () => {
  it('owner can do everything, sales cannot manage config or territories', () => {
    expect(can(owner, 'config.edit')).toBe(true);
    expect(can(owner, 'territory.edit')).toBe(true);
    expect(can(sales, 'lead.create')).toBe(true);
    expect(can(sales, 'lead.update')).toBe(true);
    expect(can(sales, 'config.edit')).toBe(false);
    expect(can(sales, 'territory.edit')).toBe(false);
    expect(can(sales, 'dailyReport.viewAll')).toBe(false);
  });
  it('assertCan throws "forbidden" when denied', () => {
    expect(() => assertCan(sales, 'config.edit')).toThrow('forbidden');
    expect(() => assertCan(owner, 'config.edit')).not.toThrow();
  });
  it('stripFinancial removes fields only for SALES', () => {
    const row = { id: '1', name: 'X', ssBillingPrice: 10700, floorPrice: 11556 };
    expect(stripFinancial(sales, row, ['ssBillingPrice', 'floorPrice'])).toEqual({ id: '1', name: 'X' });
    expect(stripFinancial(owner, row, ['ssBillingPrice', 'floorPrice'])).toEqual(row);
  });
});
