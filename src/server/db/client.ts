import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

// Supavisor transaction-mode pooling requires prepared statements off.
const queryClient = postgres(url, { prepare: false });

export const db = drizzle(queryClient, { schema });
export type DB = typeof db;
