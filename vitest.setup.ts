// Vitest does not auto-load .env.local — pull it into process.env before any test module runs.
import { config } from 'dotenv';

config({ path: '.env.local' });
