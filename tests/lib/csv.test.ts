// tests/lib/csv.test.ts
import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';

describe('toCsv', () => {
  it('renders a header + data rows with CRLF line endings', () => {
    const csv = toCsv([{ name: 'Acme', qty: 3 }, { name: 'Beta', qty: 5 }]);
    expect(csv).toBe('name,qty\r\nAcme,3\r\nBeta,5');
  });

  it('unions keys across rows in order of first appearance', () => {
    const csv = toCsv([{ a: 1 }, { b: 2 }]);
    expect(csv.split('\r\n')[0]).toBe('a,b');
  });

  it('neutralizes a leading =/+/-/@ in a text field (formula-injection guard)', () => {
    expect(toCsv([{ name: '=cmd|calc' }])).toBe("name\r\n'=cmd|calc");
    expect(toCsv([{ name: '+1+1' }])).toBe("name\r\n'+1+1");
    expect(toCsv([{ name: '@evil' }])).toBe("name\r\n'@evil");
    expect(toCsv([{ name: '-shady' }])).toBe("name\r\n'-shady");
  });

  it('does not prefix a negative number field — only text is a formula-injection risk', () => {
    expect(toCsv([{ valuePaise: -50000 }])).toBe('valuePaise\r\n-50000');
  });

  it('quotes a field containing a comma, doubling any internal quotes', () => {
    expect(toCsv([{ name: 'Smith, John' }])).toBe('name\r\n"Smith, John"');
    expect(toCsv([{ name: 'say "hi"' }])).toBe('name\r\n"say ""hi"""');
  });

  it('quotes a field containing an embedded newline', () => {
    expect(toCsv([{ notes: 'line1\nline2' }])).toBe('notes\r\n"line1\nline2"');
  });

  it('renders null/undefined as an empty field', () => {
    expect(toCsv([{ notes: null }])).toBe('notes\r\n');
  });

  it('returns an empty string for zero rows', () => {
    expect(toCsv([])).toBe('');
  });
});
