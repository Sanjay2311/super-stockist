import { and, eq, isNull, asc } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { territories } from '@/server/db/schema/territory';
import { territorySchema, type TerritoryInput } from '@/lib/schemas';
import { patchOnly } from '@/lib/patch';
import { assertCan } from '@/server/auth/permissions';
import { writeAudit } from './audit';
import type { AppUser } from '@/server/auth/session';

export type TerritoryRow = typeof territories.$inferSelect;
export interface TerritoryNode extends TerritoryRow {
  children: TerritoryNode[];
}

export async function listTerritories(orgId: string): Promise<TerritoryRow[]> {
  return db
    .select()
    .from(territories)
    .where(and(eq(territories.orgId, orgId), isNull(territories.deletedAt), eq(territories.active, true)))
    .orderBy(asc(territories.name));
}

export async function territoryTree(orgId: string): Promise<TerritoryNode[]> {
  const rows = await listTerritories(orgId);
  const byId = new Map(rows.map((r) => [r.id, { ...r, children: [] as TerritoryNode[] }]));
  const roots: TerritoryNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId)!.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export async function descendantIds(orgId: string, territoryId: string): Promise<string[]> {
  const rows = await listTerritories(orgId);
  const out: string[] = [];
  const stack = [territoryId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const r of rows) {
      if (r.parentId === id) {
        out.push(r.id);
        stack.push(r.id);
      }
    }
  }
  return out;
}

export async function ancestorIds(orgId: string, territoryId: string): Promise<string[]> {
  const rows = await listTerritories(orgId);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: string[] = [];
  let cur = byId.get(territoryId)?.parentId ?? null;
  while (cur && byId.has(cur)) {
    out.push(cur);
    cur = byId.get(cur)!.parentId ?? null;
  }
  return out;
}

export async function createTerritory(user: AppUser, input: TerritoryInput): Promise<TerritoryRow> {
  assertCan(user, 'territory.edit');
  const data = territorySchema.parse(input);
  const [row] = await db.insert(territories).values({ ...data, orgId: user.orgId }).returning();
  await writeAudit(user, 'territory', row.id, 'create', null, row);
  return row;
}

export async function updateTerritory(
  user: AppUser,
  id: string,
  input: Partial<TerritoryInput>,
): Promise<TerritoryRow> {
  assertCan(user, 'territory.edit');
  const [before] = await db
    .select()
    .from(territories)
    .where(and(eq(territories.id, id), eq(territories.orgId, user.orgId)));
  if (!before) throw new Error('not found');
  const data = patchOnly(input, territorySchema.partial().parse(input));
  const [row] = await db
    .update(territories)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(territories.id, id))
    .returning();
  await writeAudit(user, 'territory', id, 'update', before, row);
  return row;
}

// ponytail: exclusivity conflict detection needs the distributors table, which
// does not exist until Milestone 2. Stub returns false so callers compile now;
// real exclusivity check lands in M2 with the distributors table.
/* eslint-disable @typescript-eslint/no-unused-vars */
export async function overlapsExclusive(
  orgId: string,
  territoryId: string,
  excludeDistributorId?: string,
): Promise<boolean> {
  return false;
}
/* eslint-enable @typescript-eslint/no-unused-vars */
