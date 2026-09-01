import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { createLead, setStage } from '@/server/services/lead';
import type { AppUser } from '@/server/auth/session';

const owner = (orgId: string): AppUser => ({ id: 'o', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId });

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('setStage', () => {
  it('moves stage and syncs probability from config defaults', async () => {
    const { orgId } = await seedBase();
    const lead = await createLead(owner(orgId), { businessName: 'A Co', contactPerson: 'Arun', phone: '9000000001' });
    const moved = await setStage(owner(orgId), lead.id, 'NEGOTIATION');
    expect(moved.stage).toBe('NEGOTIATION');
    expect(moved.probability).toBe(60);
  });

  it('requires a lost reason when moving to LOST', async () => {
    const { orgId } = await seedBase();
    const lead = await createLead(owner(orgId), { businessName: 'B Co', contactPerson: 'Bina', phone: '9000000002' });
    await expect(setStage(owner(orgId), lead.id, 'LOST')).rejects.toThrow('lostReason required');
    const lost = await setStage(owner(orgId), lead.id, 'LOST', { lostReason: 'PRICE', lostNotes: 'too high' });
    expect(lost.stage).toBe('LOST');
    expect(lost.probability).toBe(0);
    expect(lost.lostReason).toBe('PRICE');
    expect(lost.lostNotes).toBe('too high');
  });
});
