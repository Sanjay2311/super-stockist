import { requireUser } from '@/server/auth/session';
import { can } from '@/server/auth/permissions';
import { territoryTree, listTerritories, type TerritoryNode } from '@/server/services/territory';
import { TERRITORY_TYPES } from '@/lib/schemas';
import { addTerritory } from './actions';

function Tree({ nodes, depth = 0 }: { nodes: TerritoryNode[]; depth?: number }) {
  return (
    <ul>
      {nodes.map((n) => (
        <li key={n.id}>
          <div style={{ paddingLeft: depth * 16 }} className="py-1 text-sm">
            {n.name} <span className="text-neutral-400">· {n.type}</span>
          </div>
          {n.children.length > 0 && <Tree nodes={n.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}

export default async function TerritoriesPage() {
  const user = await requireUser();
  const [tree, flat] = await Promise.all([territoryTree(user.orgId), listTerritories(user.orgId)]);
  return (
    <main className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Territories</h1>
      <div className="rounded border p-4">
        {tree.length > 0 ? <Tree nodes={tree} /> : <p className="text-sm text-neutral-400">No territories yet.</p>}
      </div>
      {can(user, 'territory.edit') && (
        <form action={addTerritory} className="flex flex-wrap items-end gap-2 rounded border p-4">
          <label className="text-sm">
            Name
            <input name="name" required className="mt-1 block rounded border px-2 py-1" />
          </label>
          <label className="text-sm">
            Type
            <select name="type" className="mt-1 block rounded border px-2 py-1">
              {TERRITORY_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Parent
            <select name="parentId" className="mt-1 block rounded border px-2 py-1">
              <option value="">(none)</option>
              {flat.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">Add</button>
        </form>
      )}
    </main>
  );
}
