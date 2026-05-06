import { db, type GroupRow } from './db';
import { getGroupDoc } from '../crdt/group-doc';
import { projectExpense, projectMember, projectSettlement } from '../crdt/projections';
import type { CurrencyCode } from '../money/types';

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
  await db().members.where('groupId').equals(groupId).delete();
  if (members.length) await db().members.bulkPut(members);

  const expenses = handle.expenses.map((e) => projectExpense(groupId, e));
  await db().expenses.where('groupId').equals(groupId).delete();
  if (expenses.length) await db().expenses.bulkPut(expenses);

  const settlements = handle.settlements.map((s) => projectSettlement(groupId, s));
  await db().settlements.where('groupId').equals(groupId).delete();
  if (settlements.length) await db().settlements.bulkPut(settlements);

  return groupRow;
}

export function attachGroupObservers(groupId: string): () => void {
  const handle = getGroupDoc(groupId);
  let pending = false;
  const flush = () => {
    if (pending) return;
    pending = true;
    queueMicrotask(async () => {
      pending = false;
      try {
        await hydrateGroupCache(groupId);
      } catch (err) {
        console.error('[PrivShare] Hydration failed', err);
      }
    });
  };
  handle.meta.observeDeep(flush);
  handle.members.observeDeep(flush);
  handle.expenses.observeDeep(flush);
  handle.settlements.observeDeep(flush);
  return () => {
    handle.meta.unobserveDeep(flush);
    handle.members.unobserveDeep(flush);
    handle.expenses.unobserveDeep(flush);
    handle.settlements.unobserveDeep(flush);
  };
}
