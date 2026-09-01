import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { createLead, setStage, boardLeads, getLead } from '@/server/services/lead';
import { distributorLeads } from '@/server/db/schema/crm';
import { territories } from '@/server/db/schema/territory';
import { employees } from '@/server/db/schema/identity';
import type { AppUser } from '@/server/auth/session';

const owner = (orgId: string): AppUser => ({ id: 'o', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId });

// The move action calls requireUser() (needs Next request context + Supabase) — stub it;
// only the LOST/ON_HOLD guard branch is under test here.
vi.mock('@/server/auth/session', async (orig) => ({
  ...(await orig<typeof import('@/server/auth/session')>()),
  requireUser: vi.fn(),
}));
import { requireUser } from '@/server/auth/session';
import { moveLeadAction } from '@/app/(app)/pipeline/actions';

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('boardLeads', () => {
  it('returns each open lead with joined territory + assignee and its current stage/probability', async () => {
    const { orgId } = await seedBase();
    const [terr] = await testDb.insert(territories)
      .values({ orgId, name: 'North Zone', type: 'ZONE' }).returning();
    const [emp] = await testDb.insert(employees)
      .values({ orgId, name: 'Priya Rao', phone: '9800000000' }).returning();

    const alpha = await createLead(owner(orgId), {
      businessName: 'Alpha Distributors', contactPerson: 'Amit', phone: '9111111111',
      territoryId: terr.id, assignedEmployeeId: emp.id, expectedFfMonthlyPotential: 5000000,
    });
    const beta = await createLead(owner(orgId), {
      businessName: 'Beta Traders', contactPerson: 'Bala', phone: '9222222222',
    });
    await setStage(owner(orgId), alpha.id, 'NEGOTIATION');

    const board = await boardLeads(orgId);
    expect(board).toHaveLength(2);

    const a = board.find((l) => l.id === alpha.id)!;
    expect(a.territoryName).toBe('North Zone');
    expect(a.assignee).toBe('Priya Rao');
    expect(a.stage).toBe('NEGOTIATION');
    expect(a.probability).toBe(60);
    expect(a.nextFollowUpAt).toBeNull();

    const b = board.find((l) => l.id === beta.id)!;
    expect(b.territoryName).toBeNull();
    expect(b.assignee).toBeNull();
    expect(b.stage).toBe('IDENTIFIED');
  });

  it('excludes soft-deleted leads', async () => {
    const { orgId } = await seedBase();
    const gone = await createLead(owner(orgId), {
      businessName: 'Gone Traders', contactPerson: 'Gita', phone: '9333333333',
    });
    await testDb.update(distributorLeads).set({ deletedAt: new Date() })
      .where(eq(distributorLeads.id, gone.id));
    expect(await boardLeads(orgId)).toHaveLength(0);
  });
});

describe('moveLeadAction guard', () => {
  it('routes a LOST move to the detail page and does not change the stage', async () => {
    const { orgId } = await seedBase();
    vi.mocked(requireUser).mockResolvedValue(owner(orgId));
    const lead = await createLead(owner(orgId), {
      businessName: 'Guarded Co', contactPerson: 'Gopal', phone: '9444444444',
    });

    const res = await moveLeadAction(lead.id, 'LOST');
    expect(res).toEqual({ error: 'open-detail' });

    const after = await getLead(orgId, lead.id);
    expect(after?.stage).toBe('IDENTIFIED');
  });
});
