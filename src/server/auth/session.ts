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

function toAppUser(row: typeof users.$inferSelect): AppUser {
  return {
    id: row.id, email: row.email, name: row.name,
    role: row.role as Role, employeeId: row.employeeId, orgId: row.orgId,
  };
}

export async function getSession(): Promise<AppUser | null> {
  // ponytail: dev-only escape hatch — browse the app without a Supabase Auth
  // server (none runs locally). Hard-gated: inert when NODE_ENV === 'production'
  // AND requires DEV_LOGIN_EMAIL to be set. Remove once Supabase auth is wired.
  if (process.env.NODE_ENV !== 'production' && process.env.DEV_LOGIN_EMAIL) {
    const [devRow] = await db.select().from(users)
      .where(eq(users.email, process.env.DEV_LOGIN_EMAIL));
    if (devRow && devRow.status === 'active') return toAppUser(devRow);
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [row] = await db.select().from(users).where(eq(users.id, user.id));
  if (!row || row.status !== 'active') return null;
  return toAppUser(row);
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
