import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrateTestDb, resetDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { createTerritory, listTerritories, territoryTree, descendantIds } from '@/server/services/territory';
import type { AppUser } from '@/server/auth/session';

const owner: AppUser = { id: 'o', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId: '' };
const sales: AppUser = { id: 's', email: 's', name: 'S', role: 'SALES', employeeId: null, orgId: '' };

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('territory service', () => {
  it('creates a hierarchy and lists/nests it', async () => {
    const { orgId } = await seedBase();
    const east = await createTerritory({ ...owner, orgId }, { name: 'Bangalore East', type: 'ZONE', parentId: null });
    const wf = await createTerritory({ ...owner, orgId }, { name: 'Whitefield', type: 'AREA', parentId: east.id });
    await createTerritory({ ...owner, orgId }, { name: 'Hoodi', type: 'AREA', parentId: east.id });

    expect((await listTerritories(orgId)).map((t) => t.name)).toEqual(['Bangalore East', 'Hoodi', 'Whitefield']);
    const tree = await territoryTree(orgId);
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((c) => c.name).sort()).toEqual(['Hoodi', 'Whitefield']);
    expect(await descendantIds(orgId, east.id)).toEqual(expect.arrayContaining([wf.id]));
  });

  it('forbids a sales rep from creating a territory', async () => {
    const { orgId } = await seedBase();
    await expect(createTerritory({ ...sales, orgId }, { name: 'X', type: 'AREA', parentId: null }))
      .rejects.toThrow('forbidden');
  });
});
