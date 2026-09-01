import { describe, it, expect } from 'vitest';
import { FF_CATALOGUE } from '@/server/db/ff-catalogue';

describe('FF_CATALOGUE', () => {
  it('parses 184 SKUs with integer paise and valid categories', () => {
    expect(FF_CATALOGUE.skus).toHaveLength(184);
    expect(FF_CATALOGUE.gstInclusive).toBe(true);
    const cats = new Set(FF_CATALOGUE.skus.map((s) => s.category));
    expect([...cats].sort()).toEqual(['Dry Fruits', 'Flours', 'Other', 'Seeds', 'Spices']);
    for (const s of FF_CATALOGUE.skus) {
      expect(Number.isInteger(s.currentPaise)).toBe(true);
      expect(s.currentPaise).toBeGreaterThan(0);
      expect(s.mrpPaise === null || Number.isInteger(s.mrpPaise)).toBe(true);
    }
  });
  it('has the Almond 100g row from the sheet', () => {
    const a = FF_CATALOGUE.skus.find((s) => s.product === 'Almond' && s.packLabel === '100g')!;
    expect(a).toMatchObject({ category: 'Dry Fruits', currentPaise: 10700, mrpPaise: 19300, volatile: true });
  });
  it('the 1kg jar packs have no MRP', () => {
    const oneKg = FF_CATALOGUE.skus.filter((s) => s.packLabel === '1kg' && s.unit === 'G');
    expect(oneKg.length).toBeGreaterThan(0);
    expect(oneKg.every((s) => s.mrpPaise === null)).toBe(true);
  });
});
