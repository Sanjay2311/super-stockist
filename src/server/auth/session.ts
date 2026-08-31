import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema/identity';
import { createServerClient } from './supabase';

export type Role = 'OWNER' | 'SALES';

export interface AppUser {
  id: string; email: string; name: string;
  role: Role; employeeId: string | null; orgId: string;
}

export async function getSession(): Promise<AppUser | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [row] = await db.select().from(users).where(eq(users.id, user.id));
  if (!row || row.status !== 'active') return null;
  return {
    id: row.id, email: row.email, name: row.name,
    role: row.role as Role, employeeId: row.employeeId, orgId: row.orgId,
  };
}

// ponytail: requireUser() is a thin getSession() + redirect() wrapper — the redirect
// branch needs Next request internals to test, so it is covered by the (skipped) e2e
// auth spec rather than a unit test. Ceiling: redirect path unverified in CI until
// Supabase is available; upgrade path: the e2e spec exercises it once CI runs it.
export async function requireUser(): Promise<AppUser> {
  const u = await getSession();
  if (!u) redirect('/login');
  return u;
}
