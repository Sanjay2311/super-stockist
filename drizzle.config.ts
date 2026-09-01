import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit auto-loads .env only; this project keeps its vars in .env.local.
config({ path: '.env.local' });

export default defineConfig({
  schema: './src/server/db/schema/*.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
