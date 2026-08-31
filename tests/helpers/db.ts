import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { runMigrations } from '@/server/db/migrate';
import * as schema from '@/server/db/schema';

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!;
const client = postgres(url, { prepare: false });
export const testDb = drizzle(client, { schema });

export async function migrateTestDb() {
  await runMigrations(url);
}

/** Truncate every table in the public schema except drizzle's migration bookkeeping. */
export async function resetDb() {
  const rows = await testDb.execute(sql`
    select tablename from pg_tables
    where schemaname = 'public' and tablename not like '__drizzle%'
  `);
  const names = rows.map((r) => `"${String(r.tablename)}"`).join(', ');
  if (names) await testDb.execute(sql.raw(`truncate ${names} restart identity cascade`));
}
