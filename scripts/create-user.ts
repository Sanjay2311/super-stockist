import 'dotenv/config'; // run with DOTENV_CONFIG_PATH=.env.local (as db:seed / db:migrate do)
import { createClient } from '@supabase/supabase-js';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema/identity';
import { seedBase } from '@/server/db/seed';

const [email, password, name, role] = process.argv.slice(2);
if (!email || !password || !name || !['OWNER', 'SALES'].includes(role)) {
  console.error('usage: tsx scripts/create-user.ts <email> <password> <name> <OWNER|SALES>');
  process.exit(1);
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const { orgId } = await seedBase();
const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw error;
await db.insert(users).values({ id: data.user.id, orgId, email, name, role });
console.log('created', role, email);
process.exit(0);
