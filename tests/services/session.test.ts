import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { testDb, migrateTestDb, resetDb } from '../helpers/db';
import { users } from '@/server/db/schema/identity';
import { seedBase } from '@/server/db/seed';

// The Supabase auth server does not exist in this environment, so stub the SSR client:
// only getSession()'s own logic (DB join + status gate + AppUser mapping) is under test.
vi.mock('@/server/auth/supabase', () => ({ createServerClient: vi.fn() }));

import { createServerClient } from '@/server/auth/supabase';
import { getSession } from '@/server/auth/session';

type ServerClient = Awaited<ReturnType<typeof createServerClient>>;

/** Point the mocked createServerClient at an auth user id (or null for "signed out"). */
function stubAuthUser(id: string | null) {
  vi.mocked(createServerClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: id ? { id } : null } }) },
  } as unknown as ServerClient);
}

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('getSession', () => {
  it('maps the users row to an AppUser for an active OWNER', async () => {
    const { orgId } = await seedBase();
    const id = crypto.randomUUID();
    await testDb.insert(users).values({
      id, orgId, email: 'owner@example.com', name: 'Owner', role: 'OWNER', status: 'active',
    });
    stubAuthUser(id);

    expect(await getSession()).toEqual({
      id, email: 'owner@example.com', name: 'Owner', role: 'OWNER', employeeId: null, orgId,
    });
  });

  it('returns null when Supabase has no authenticated user', async () => {
    await seedBase();
    stubAuthUser(null);
    expect(await getSession()).toBeNull();
  });

  it('returns null when there is no matching users row', async () => {
    await seedBase();
    stubAuthUser(crypto.randomUUID()); // valid uuid, but never inserted
    expect(await getSession()).toBeNull();
  });

  it('returns null when the users row is not active', async () => {
    const { orgId } = await seedBase();
    const id = crypto.randomUUID();
    await testDb.insert(users).values({
      id, orgId, email: 'ex@example.com', name: 'Ex', role: 'SALES', status: 'disabled',
    });
    stubAuthUser(id);
    expect(await getSession()).toBeNull();
  });
});
