import * as Y from 'yjs';
import { newId } from '../ids/ulid';
import { getGroupDoc, findById, findIndexById } from './group-doc';
import type { CurrencyCode } from '../money/types';
import type { ParticipantShare } from '../money/split';

export interface InitGroupInput {
  groupId: string;
  name: string;
  currency: CurrencyCode;
  createdByFingerprint: string;
}

export function initGroupDoc(input: InitGroupInput): void {
  const handle = getGroupDoc(input.groupId);
  handle.doc.transact(() => {
    if (!handle.meta.has('createdAt')) {
      handle.meta.set('id', input.groupId);
      handle.meta.set('name', input.name);
      handle.meta.set('currency', input.currency);
      handle.meta.set('createdAt', new Date().toISOString());
      handle.meta.set('createdByFingerprint', input.createdByFingerprint);
    }
  });
}

export function setGroupMeta(
  groupId: string,
  patch: Partial<{ name: string; currency: CurrencyCode; archivedAt: string | null }>
): void {
  const handle = getGroupDoc(groupId);
  handle.doc.transact(() => {
    if (patch.name !== undefined) handle.meta.set('name', patch.name);
    if (patch.currency !== undefined) handle.meta.set('currency', patch.currency);
    if (patch.archivedAt !== undefined) {
      if (patch.archivedAt === null) {
        handle.meta.delete('archivedAt');
      } else {
        handle.meta.set('archivedAt', patch.archivedAt);
      }
    }
  });
}

export function addMember(
  groupId: string,
  args: { name: string; color: string; claimedByFingerprint?: string }
): string {
  const id = newId();
  const handle = getGroupDoc(groupId);
  handle.doc.transact(() => {
    const m = new Y.Map<unknown>();
    m.set('id', id);
    m.set('name', args.name);
    m.set('color', args.color);
    if (args.claimedByFingerprint) m.set('claimedByFingerprint', args.claimedByFingerprint);
    m.set('createdAt', new Date().toISOString());
    handle.members.push([m]);
  });
  return id;
}

/**
 * Reconcile a joining device with the group's membership. If an unclaimed
 * member entry exists, claim it (set fingerprint + name). Otherwise insert a
 * new member with the joiner's name + fingerprint. Idempotent: calling twice
 * with the same fingerprint is a no-op after the first call.
 */
export function claimOrInsertMember(
  groupId: string,
  args: { displayName: string; fingerprint: string; color: string }
): { claimedExisting: boolean; memberId: string } {
  const handle = getGroupDoc(groupId);
  let result: { claimedExisting: boolean; memberId: string } | null = null;
  handle.doc.transact(() => {
    // Already claimed by this fingerprint?
    for (let i = 0; i < handle.members.length; i += 1) {
      const m = handle.members.get(i);
      if (m.get('claimedByFingerprint') === args.fingerprint) {
        result = { claimedExisting: true, memberId: m.get('id') as string };
        return;
      }
    }
    // Claim the first unclaimed, non-removed entry.
    for (let i = 0; i < handle.members.length; i += 1) {
      const m = handle.members.get(i);
      if (m.get('claimedByFingerprint') == null && m.get('removedAt') == null) {
        m.set('claimedByFingerprint', args.fingerprint);
        m.set('name', args.displayName);
        result = { claimedExisting: true, memberId: m.get('id') as string };
        return;
      }
    }
    // No placeholder available: insert a fresh member.
    const id = newId();
    const m = new Y.Map<unknown>();
    m.set('id', id);
    m.set('name', args.displayName);
    m.set('color', args.color);
    m.set('claimedByFingerprint', args.fingerprint);
    m.set('createdAt', new Date().toISOString());
    handle.members.push([m]);
    result = { claimedExisting: false, memberId: id };
  });
  if (!result) throw new Error('claimOrInsertMember: transaction did not produce a result');
  return result;
}

export function updateMember(
  groupId: string,
  memberId: string,
  patch: Partial<{ name: string; color: string }>
): void {
  const handle = getGroupDoc(groupId);
  handle.doc.transact(() => {
    const m = findById(handle.members, memberId);
    if (!m) return;
    if (patch.name !== undefined) m.set('name', patch.name);
    if (patch.color !== undefined) m.set('color', patch.color);
  });
}

export function removeMember(groupId: string, memberId: string): void {
  const handle = getGroupDoc(groupId);
  handle.doc.transact(() => {
    const m = findById(handle.members, memberId);
    if (m) m.set('removedAt', new Date().toISOString());
  });
}

export interface AddExpenseInput {
  description: string;
  amountMinor: number;
  date: string;
  category: string;
  notes?: string;
  paidByMemberId: string;
  splitType: 'equal' | 'exact';
  participants: ReadonlyArray<string>;
  exactShares?: ReadonlyArray<ParticipantShare>;
  createdByFingerprint: string;
}

export function addExpense(groupId: string, input: AddExpenseInput): string {
  const id = newId();
  const handle = getGroupDoc(groupId);
  const now = new Date().toISOString();
  handle.doc.transact(() => {
    const e = new Y.Map<unknown>();
    e.set('id', id);
    e.set('description', input.description);
    e.set('amountMinor', input.amountMinor);
    e.set('date', input.date);
    e.set('category', input.category);
    if (input.notes) e.set('notes', input.notes);
    e.set('paidByMemberId', input.paidByMemberId);
    const split = new Y.Map<unknown>();
    split.set('type', input.splitType);
    const ps = new Y.Array<string>();
    ps.insert(0, [...input.participants]);
    split.set('participants', ps);
    if (input.splitType === 'exact' && input.exactShares) {
      const amounts = new Y.Map<number>();
      for (const s of input.exactShares) amounts.set(s.memberId, s.amountMinor);
      split.set('amounts', amounts);
    }
    e.set('split', split);
    e.set('createdByFingerprint', input.createdByFingerprint);
    e.set('createdAt', now);
    e.set('updatedAt', now);
    handle.expenses.push([e]);
  });
  return id;
}

export function updateExpense(
  groupId: string,
  expenseId: string,
  patch: Partial<Omit<AddExpenseInput, 'createdByFingerprint'>>
): void {
  const handle = getGroupDoc(groupId);
  handle.doc.transact(() => {
    const e = findById(handle.expenses, expenseId);
    if (!e) return;
    if (patch.description !== undefined) e.set('description', patch.description);
    if (patch.amountMinor !== undefined) e.set('amountMinor', patch.amountMinor);
    if (patch.date !== undefined) e.set('date', patch.date);
    if (patch.category !== undefined) e.set('category', patch.category);
    if (patch.notes !== undefined) e.set('notes', patch.notes);
    if (patch.paidByMemberId !== undefined) e.set('paidByMemberId', patch.paidByMemberId);
    if (patch.splitType || patch.participants || patch.exactShares) {
      const split = (e.get('split') as Y.Map<unknown>) ?? new Y.Map<unknown>();
      if (patch.splitType) split.set('type', patch.splitType);
      if (patch.participants) {
        const ps = new Y.Array<string>();
        ps.insert(0, [...patch.participants]);
        split.set('participants', ps);
      }
      if (patch.exactShares) {
        const amounts = new Y.Map<number>();
        for (const s of patch.exactShares) amounts.set(s.memberId, s.amountMinor);
        split.set('amounts', amounts);
      } else if (patch.splitType === 'equal') {
        split.delete('amounts');
      }
      e.set('split', split);
    }
    e.set('updatedAt', new Date().toISOString());
  });
}

export function deleteExpense(groupId: string, expenseId: string): void {
  const handle = getGroupDoc(groupId);
  handle.doc.transact(() => {
    const e = findById(handle.expenses, expenseId);
    if (e) e.set('deletedAt', new Date().toISOString());
  });
}

export function restoreExpense(groupId: string, expenseId: string): void {
  const handle = getGroupDoc(groupId);
  handle.doc.transact(() => {
    const e = findById(handle.expenses, expenseId);
    if (e) e.delete('deletedAt');
  });
}

export function permanentlyDeleteExpense(groupId: string, expenseId: string): void {
  const handle = getGroupDoc(groupId);
  handle.doc.transact(() => {
    const idx = findIndexById(handle.expenses, expenseId);
    if (idx >= 0) handle.expenses.delete(idx, 1);
  });
}

export interface AddSettlementInput {
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
  date: string;
  note?: string;
  createdByFingerprint: string;
}

export function addSettlement(groupId: string, input: AddSettlementInput): string {
  const id = newId();
  const handle = getGroupDoc(groupId);
  const now = new Date().toISOString();
  handle.doc.transact(() => {
    const s = new Y.Map<unknown>();
    s.set('id', id);
    s.set('fromMemberId', input.fromMemberId);
    s.set('toMemberId', input.toMemberId);
    s.set('amountMinor', input.amountMinor);
    s.set('date', input.date);
    if (input.note) s.set('note', input.note);
    s.set('createdByFingerprint', input.createdByFingerprint);
    s.set('createdAt', now);
    handle.settlements.push([s]);
  });
  return id;
}

export function deleteSettlement(groupId: string, settlementId: string): void {
  const handle = getGroupDoc(groupId);
  handle.doc.transact(() => {
    const s = findById(handle.settlements, settlementId);
    if (s) s.set('deletedAt', new Date().toISOString());
  });
}

export function restoreSettlement(groupId: string, settlementId: string): void {
  const handle = getGroupDoc(groupId);
  handle.doc.transact(() => {
    const s = findById(handle.settlements, settlementId);
    if (s) s.delete('deletedAt');
  });
}
