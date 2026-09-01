import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { createLead, updateLead, rescoreLead, listLeads } from '@/server/services/lead';
import type { AppUser } from '@/server/auth/session';

const owner = (orgId: string): AppUser => ({ id: 'o', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId });
const sales = (orgId: string, employeeId: string): AppUser => ({ id: 's', email: 's', name: 'S', role: 'SALES', employeeId, orgId });

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('lead service', () => {
  it('creates a lead and defaults the assignee to the SALES caller', async () => {
    const { orgId } = await seedBase();
    const emp = crypto.randomUUID();
    const lead = await createLead(sales(orgId, emp), {
      businessName: 'Acme Traders', contactPerson: 'Ravi', phone: '9876543210',
      expectedFfMonthlyPotential: 30000000,
    });
    expect(lead.assignedEmployeeId).toBe(emp);
    expect(lead.stage).toBe('IDENTIFIED');
  });

  it('partial update does not clobber columns the caller did not send', async () => {
    const { orgId } = await seedBase();
    const lead = await createLead(owner(orgId), {
      businessName: 'Infra Co', contactPerson: 'Deepa', phone: '9333333333', deliveryVehicles: 3,
    });
    expect(lead.deliveryVehicles).toBe(3);

    const updated = await updateLead(owner(orgId), lead.id, { businessName: 'Infra Co Renamed' });
    expect(updated.businessName).toBe('Infra Co Renamed');
    expect(updated.deliveryVehicles).toBe(3); // schema .default(0) must not have overwritten it
  });

  it('rejects a bad phone number', async () => {
    const { orgId } = await seedBase();
    await expect(createLead(owner(orgId), { businessName: 'X Co', contactPerson: 'Yash', phone: '12345' }))
      .rejects.toThrow();
  });

  it('rescores a lead using the org score weights', async () => {
    const { orgId } = await seedBase();
    const lead = await createLead(owner(orgId), { businessName: 'Big Distributor', contactPerson: 'Anil', phone: '9000000000' });
    const updated = await rescoreLead(owner(orgId), lead.id, {
      retailerNetwork: 1, categoryExperience: 1, geoCoverage: 1, salesmen: 1,
      deliveryInfra: 1, workingCapital: 1, brandPortfolio: 1, reputation: 1, willingness: 1,
    });
    expect(updated.score).toBe(100);
    expect(updated.grade).toBe('A');
  });

  it('filters the list by stage and search text', async () => {
    const { orgId } = await seedBase();
    await createLead(owner(orgId), { businessName: 'Alpha Foods', contactPerson: 'Amit', phone: '9111111111' });
    const beta = await createLead(owner(orgId), { businessName: 'Beta Mart', contactPerson: 'Bala', phone: '9222222222' });
    await updateLead(owner(orgId), beta.id, { businessName: 'Beta Mart' });
    expect((await listLeads(orgId, { q: 'beta' })).map((l) => l.businessName)).toEqual(['Beta Mart']);
    expect(await listLeads(orgId, { stage: 'CONTACTED' })).toHaveLength(0);
  });

  it('forbids a sales rep from deleting', async () => {
    const { orgId } = await seedBase();
    const s = sales(orgId, crypto.randomUUID());
    // no delete in M1 UI; assert the matrix denies it
    const { can } = await import('@/server/auth/permissions');
    expect(can(s, 'lead.delete')).toBe(false);
  });
});
