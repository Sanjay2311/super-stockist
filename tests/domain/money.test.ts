import { describe, it, expect } from 'vitest';
import { formatINR, rupees } from '@/domain/money';

describe('money', () => {
  it('converts rupees to integer paise', () => {
    expect(rupees(107)).toBe(10700);
    expect(rupees(50.4)).toBe(5040);
  });
  it('formats paise as en-IN currency with lakh grouping', () => {
    expect(formatINR(10700)).toBe('₹107.00');
    expect(formatINR(15000000)).toBe('₹1,50,000.00');
  });
});
