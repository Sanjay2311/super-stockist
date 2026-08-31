import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// ponytail: single client switched by VITEST env — ceiling: one DB per process.
// Upgrade path: inject the client where a second DB (e.g. per-test isolation) is needed.
const url = process.env.VITEST
  ? (process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL)
  : process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

// Supavisor transaction-mode pooling requires prepared statements off.
const queryClient = postgres(url, { prepare: false });

export const db = drizzle(queryClient, { schema });
export type DB = typeof db;
