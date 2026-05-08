import * as Y from 'yjs';
import type { ExpenseCacheRow, MemberCacheRow, SettlementCacheRow } from '../storage/db';

export function projectMember(groupId: string, m: Y.Map<unknown>): MemberCacheRow {
  const row: MemberCacheRow = {
    id: m.get('id') as string,
    groupId,
    name: (m.get('name') as string) ?? '',
    color: (m.get('color') as string) ?? '#64748b',
  };
  const claimed = m.get('claimedByFingerprint') as string | undefined;
  if (claimed) row.claimedByFingerprint = claimed;
  const removed = m.get('removedAt') as string | undefined;
  if (removed) row.removedAt = removed;
  return row;
}

export function projectExpense(groupId: string, e: Y.Map<unknown>): ExpenseCacheRow {
  const split = e.get('split') as Y.Map<unknown> | undefined;
  const splitType =
    (split?.get('type') as 'equal' | 'exact' | 'percentage' | 'shares' | 'adjustments') ?? 'equal';
  const participants = (split?.get('participants') as Y.Array<string> | undefined)?.toArray() ?? [];
  let exactShares: { memberId: string; amountMinor: number }[] | undefined;
  if (splitType !== 'equal') {
    const amounts = split?.get('amounts') as Y.Map<number> | undefined;
    if (amounts) {
      exactShares = participants.map((memberId) => ({
        memberId,
        amountMinor: (amounts.get(memberId) as number) ?? 0,
      }));
    }
  }
  const row: ExpenseCacheRow = {
    id: e.get('id') as string,
    groupId,
    description: (e.get('description') as string) ?? '',
    amountMinor: (e.get('amountMinor') as number) ?? 0,
    date: (e.get('date') as string) ?? new Date().toISOString().slice(0, 10),
    category: (e.get('category') as string) ?? 'Other',
    paidByMemberId: (e.get('paidByMemberId') as string) ?? '',
    splitType,
    participants,
    createdByFingerprint: (e.get('createdByFingerprint') as string) ?? '',
    createdAt: (e.get('createdAt') as string) ?? '',
    updatedAt: (e.get('updatedAt') as string) ?? '',
  };
  const notes = e.get('notes') as string | undefined;
  if (notes) row.notes = notes;
  if (exactShares) row.exactShares = exactShares;
  const historyArr = e.get('history') as Y.Array<unknown> | undefined;
  if (historyArr && historyArr.length > 0) {
    row.history = historyArr.toArray() as NonNullable<ExpenseCacheRow['history']>;
  }
  const deletedAt = e.get('deletedAt') as string | undefined;
  if (deletedAt) row.deletedAt = deletedAt;
  return row;
}

export function projectSettlement(groupId: string, s: Y.Map<unknown>): SettlementCacheRow {
  const row: SettlementCacheRow = {
    id: s.get('id') as string,
    groupId,
    fromMemberId: (s.get('fromMemberId') as string) ?? '',
    toMemberId: (s.get('toMemberId') as string) ?? '',
    amountMinor: (s.get('amountMinor') as number) ?? 0,
    date: (s.get('date') as string) ?? new Date().toISOString().slice(0, 10),
    createdByFingerprint: (s.get('createdByFingerprint') as string) ?? '',
    createdAt: (s.get('createdAt') as string) ?? '',
  };
  const note = s.get('note') as string | undefined;
  if (note) row.note = note;
  const deletedAt = s.get('deletedAt') as string | undefined;
  if (deletedAt) row.deletedAt = deletedAt;
  return row;
}
