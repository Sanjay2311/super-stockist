import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export async function runMigrations(url = process.env.DATABASE_URL!) {
  const client = postgres(url, { max: 1 });
  await migrate(drizzle(client), { migrationsFolder: './drizzle' });
  await client.end();
}

if (process.argv[1]?.endsWith('migrate.ts')) {
  runMigrations().then(() => { console.log('migrations applied'); process.exit(0); });
}
