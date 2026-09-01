import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { testDb } from '../helpers/db';

describe('db connection', () => {
  it('runs a trivial query against the test database', async () => {
    const rows = await testDb.execute(sql`select 1 as n`);
    expect(rows[0].n).toBe(1);
  });
});
