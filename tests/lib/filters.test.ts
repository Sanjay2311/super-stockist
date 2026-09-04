// tests/lib/filters.test.ts
import { describe, it, expect } from 'vitest';
import { parseFilters } from '@/lib/filters';

describe('parseFilters', () => {
  it('extracts known keys and defaults everything else to null', () => {
    const f = parseFilters({ from: '2026-09-01', to: '2026-09-07', territory: 't1', junk: 'x' });
    expect(f).toEqual({ from: '2026-09-01', to: '2026-09-07', territoryId: 't1', employeeId: null, categoryId: null });
  });
  it('treats an array value (repeated query key) as unset', () => {
    const f = parseFilters({ from: ['a', 'b'] });
    expect(f.from).toBeNull();
  });
});
