import { db, type GroupRow } from './db';
import { getGroupDoc } from '../crdt/group-doc';
import { projectExpense, projectMember, projectSettlement } from '../crdt/projections';
import type { CurrencyCode } from '../money/types';

// Persist the current Y.Doc projection into Dexie. The Zustand store is
// driven directly by Yjs observers (see groups-store.ts); Dexie is only used
// here as a cross-group cache for ActivityFeed-style queries.
export async function hydrateGroupCache(groupId: string): Promise<GroupRow | null> {
  const handle = getGroupDoc(groupId);
  await handle.ready;
  const id = handle.meta.get('id') as string | undefined;
  if (!id) return null;

  const groupRow: GroupRow = {
    id,
    name: (handle.meta.get('name') as string) ?? 'Untitled',
    currency: (handle.meta.get('currency') as CurrencyCode) ?? 'INR',
    createdAt: (handle.meta.get('createdAt') as string) ?? new Date().toISOString(),
  };
  const archivedAt = handle.meta.get('archivedAt') as string | undefined;
  if (archivedAt) groupRow.archivedAt = archivedAt;
  await db().groups.put(groupRow);

  const members = handle.members.map((m) => projectMember(groupId, m));
  const expenses = handle.expenses.map((e) => projectExpense(groupId, e));
  const settlements = handle.settlements.map((s) => projectSettlement(groupId, s));

  // Replace per-group rows in a single transaction so a concurrent ActivityFeed
  // read never sees a half-written state.
  await db().transaction('rw', db().members, db().expenses, db().settlements, async () => {
    await db().members.where('groupId').equals(groupId).delete();
    if (members.length) await db().members.bulkPut(members);
    await db().expenses.where('groupId').equals(groupId).delete();
    if (expenses.length) await db().expenses.bulkPut(expenses);
    await db().settlements.where('groupId').equals(groupId).delete();
    if (settlements.length) await db().settlements.bulkPut(settlements);
  });

  return groupRow;
}
