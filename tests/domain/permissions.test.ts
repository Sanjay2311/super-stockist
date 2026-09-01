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
  it('gates product actions by role', () => {
    expect(can(owner, 'product.view')).toBe(true);
    expect(can(owner, 'product.edit')).toBe(true);
    expect(can(owner, 'pricing.recommend')).toBe(true);
    expect(can(sales, 'product.view')).toBe(true);
    expect(can(sales, 'product.edit')).toBe(false);
    expect(can(sales, 'pricing.recommend')).toBe(false);
  });

  // src/app/(app)/products/[id]/page.tsx mounts the <PricingPanel> client
  // component (which receives the full RecommendResult — floorPrice / targetPrice
  // / marginAtEach / cost-revealing rationale) ONLY when can(user,'product.edit').
  // SALES falls to a server-rendered non-cost table, so no `recommend` object is
  // ever serialized into a payload a SALES browser can read. This asserts the
  // gate condition that keeps that true.
  it('SALES is denied product.edit — the gate that withholds the pricing calculator + RecommendResult', () => {
    expect(can(sales, 'product.edit')).toBe(false);
    expect(can(owner, 'product.edit')).toBe(true);
  });
  it('stripFinancial removes fields only for SALES', () => {
    const row = { id: '1', name: 'X', ssBillingPrice: 10700, floorPrice: 11556 };
    expect(stripFinancial(sales, row, ['ssBillingPrice', 'floorPrice'])).toEqual({ id: '1', name: 'X' });
    expect(stripFinancial(owner, row, ['ssBillingPrice', 'floorPrice'])).toEqual(row);
  });
});
