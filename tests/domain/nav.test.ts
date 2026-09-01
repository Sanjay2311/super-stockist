import { describe, expect, it } from 'vitest';
import { visibleNavItems } from '@/components/app-nav';

const labels = (role: 'OWNER' | 'SALES') => visibleNavItems(role).map((i) => i.label);

describe('visibleNavItems', () => {
  it('shows OWNER the owner-only items', () => {
    expect(labels('OWNER')).toEqual(
      expect.arrayContaining(['Settings', 'Reports']),
    );
  });

  it('hides owner-only items from SALES but keeps the shared ones', () => {
    const sales = labels('SALES');
    expect(sales).toEqual(expect.arrayContaining(['Pipeline', 'Leads', 'Today']));
    expect(sales).not.toContain('Settings');
    expect(sales).not.toContain('Reports');
  });

  it('shows Products to both roles (product.view is granted to SALES)', () => {
    expect(labels('OWNER')).toContain('Products');
    expect(labels('SALES')).toContain('Products');
  });

  it('SALES items are a strict subset of OWNER items', () => {
    const owner = labels('OWNER');
    const sales = labels('SALES');
    expect(sales.every((l) => owner.includes(l))).toBe(true);
    expect(sales.length).toBeLessThan(owner.length);
  });
});
