import { create } from 'zustand';
import { liveQuery, type Subscription } from 'dexie';
import {
  db,
  type ExpenseCacheRow,
  type GroupRow,
  type MemberCacheRow,
  type SettlementCacheRow,
} from '../core/storage/db';
import { newId } from '../core/ids/ulid';
import { attachGroupObservers, hydrateGroupCache } from '../core/storage/hydration';
import { destroyGroupDoc } from '../core/crdt/group-doc';
import {
  addExpense as crdtAddExpense,
  addMember as crdtAddMember,
  addSettlement as crdtAddSettlement,
  deleteExpense as crdtDeleteExpense,
  deleteSettlement as crdtDeleteSettlement,
  initGroupDoc,
  permanentlyDeleteExpense as crdtPermDeleteExpense,
  removeMember as crdtRemoveMember,
  restoreExpense as crdtRestoreExpense,
  setGroupMeta,
  updateExpense as crdtUpdateExpense,
  updateMember as crdtUpdateMember,
  type AddExpenseInput,
  type AddSettlementInput,
} from '../core/crdt/operations';
import type { CurrencyCode } from '../core/money/types';

const COLOR_PALETTE = [
  '#0ea5e9',
  '#f97316',
  '#10b981',
  '#a855f7',
  '#ef4444',
  '#facc15',
  '#14b8a6',
  '#ec4899',
];

function pickColor(usedCount: number): string {
  return COLOR_PALETTE[usedCount % COLOR_PALETTE.length] ?? '#64748b';
}

interface GroupsState {
  groups: GroupRow[];
  membersByGroup: Map<string, MemberCacheRow[]>;
  expensesByGroup: Map<string, ExpenseCacheRow[]>;
  settlementsByGroup: Map<string, SettlementCacheRow[]>;
  hydratedGroupIds: Set<string>;
  detachers: Map<string, () => void>;
  bootstrap: () => Promise<void>;
  watchGroup: (groupId: string) => Promise<void>;
  unwatchGroup: (groupId: string) => void;
  createGroup: (args: {
    name: string;
    currency: CurrencyCode;
    createdByFingerprint: string;
    firstMembers: { name: string; claimedByFingerprint?: string }[];
  }) => Promise<string>;
  archiveGroup: (groupId: string, archived: boolean) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  renameGroup: (groupId: string, name: string) => Promise<void>;
  setGroupCurrency: (groupId: string, currency: CurrencyCode) => Promise<void>;
  addMember: (groupId: string, name: string, claimedByFingerprint?: string) => Promise<void>;
  updateMember: (
    groupId: string,
    memberId: string,
    patch: { name?: string; color?: string }
  ) => Promise<void>;
  removeMember: (groupId: string, memberId: string) => Promise<void>;
  addExpense: (groupId: string, input: AddExpenseInput) => Promise<string>;
  updateExpense: (
    groupId: string,
    expenseId: string,
    patch: Partial<Omit<AddExpenseInput, 'createdByFingerprint'>>
  ) => Promise<void>;
  deleteExpense: (groupId: string, expenseId: string) => Promise<void>;
  restoreExpense: (groupId: string, expenseId: string) => Promise<void>;
  permanentlyDeleteExpense: (groupId: string, expenseId: string) => Promise<void>;
  addSettlement: (groupId: string, input: AddSettlementInput) => Promise<string>;
  deleteSettlement: (groupId: string, settlementId: string) => Promise<void>;
}

let groupsSub: Subscription | null = null;
const memberSubs = new Map<string, Subscription>();
const expenseSubs = new Map<string, Subscription>();
const settlementSubs = new Map<string, Subscription>();

export const useGroups = create<GroupsState>((set, get) => ({
  groups: [],
  membersByGroup: new Map(),
  expensesByGroup: new Map(),
  settlementsByGroup: new Map(),
  hydratedGroupIds: new Set(),
  detachers: new Map(),

  bootstrap: async () => {
    if (groupsSub) return;
    groupsSub = liveQuery(() => db().groups.toArray()).subscribe({
      next: (groups) => {
        set({ groups: groups.filter((g) => !g.deletedAt) });
        for (const g of groups) {
          if (!get().hydratedGroupIds.has(g.id)) {
            void get().watchGroup(g.id);
          }
        }
      },
    });
  },

  watchGroup: async (groupId) => {
    if (get().hydratedGroupIds.has(groupId)) return;
    const detacher = attachGroupObservers(groupId);
    get().detachers.set(groupId, detacher);
    await hydrateGroupCache(groupId);
    if (!memberSubs.has(groupId)) {
      memberSubs.set(
        groupId,
        liveQuery(() => db().members.where('groupId').equals(groupId).toArray()).subscribe({
          next: (members) => {
            const next = new Map(get().membersByGroup);
            next.set(groupId, members);
            set({ membersByGroup: next });
          },
        })
      );
    }
    if (!expenseSubs.has(groupId)) {
      expenseSubs.set(
        groupId,
        liveQuery(() =>
          db().expenses.where('groupId').equals(groupId).reverse().sortBy('date')
        ).subscribe({
          next: (rows) => {
            const next = new Map(get().expensesByGroup);
            next.set(groupId, rows);
            set({ expensesByGroup: next });
          },
        })
      );
    }
    if (!settlementSubs.has(groupId)) {
      settlementSubs.set(
        groupId,
        liveQuery(() =>
          db().settlements.where('groupId').equals(groupId).reverse().sortBy('date')
        ).subscribe({
          next: (rows) => {
            const next = new Map(get().settlementsByGroup);
            next.set(groupId, rows);
            set({ settlementsByGroup: next });
          },
        })
      );
    }
    const next = new Set(get().hydratedGroupIds);
    next.add(groupId);
    set({ hydratedGroupIds: next });
  },

  unwatchGroup: (groupId) => {
    get().detachers.get(groupId)?.();
    get().detachers.delete(groupId);
    memberSubs.get(groupId)?.unsubscribe();
    memberSubs.delete(groupId);
    expenseSubs.get(groupId)?.unsubscribe();
    expenseSubs.delete(groupId);
    settlementSubs.get(groupId)?.unsubscribe();
    settlementSubs.delete(groupId);
    const next = new Set(get().hydratedGroupIds);
    next.delete(groupId);
    set({ hydratedGroupIds: next });
  },

  createGroup: async (args) => {
    const id = newId();
    initGroupDoc({
      groupId: id,
      name: args.name,
      currency: args.currency,
      createdByFingerprint: args.createdByFingerprint,
    });
    args.firstMembers.forEach((m, i) => {
      const member: { name: string; color: string; claimedByFingerprint?: string } = {
        name: m.name,
        color: pickColor(i),
      };
      if (m.claimedByFingerprint) member.claimedByFingerprint = m.claimedByFingerprint;
      crdtAddMember(id, member);
    });
    await get().watchGroup(id);
    return id;
  },

  archiveGroup: async (groupId, archived) => {
    setGroupMeta(groupId, { archivedAt: archived ? new Date().toISOString() : null });
  },

  deleteGroup: async (groupId) => {
    get().unwatchGroup(groupId);
    await db().groups.update(groupId, { deletedAt: new Date().toISOString() });
    await destroyGroupDoc(groupId);
    await db().members.where('groupId').equals(groupId).delete();
    await db().expenses.where('groupId').equals(groupId).delete();
    await db().settlements.where('groupId').equals(groupId).delete();
  },

  renameGroup: async (groupId, name) => setGroupMeta(groupId, { name }),
  setGroupCurrency: async (groupId, currency) => setGroupMeta(groupId, { currency }),

  addMember: async (groupId, name, claimedByFingerprint) => {
    const used = (get().membersByGroup.get(groupId) ?? []).length;
    const color = pickColor(used);
    const args: { name: string; color: string; claimedByFingerprint?: string } = { name, color };
    if (claimedByFingerprint) args.claimedByFingerprint = claimedByFingerprint;
    crdtAddMember(groupId, args);
  },
  updateMember: async (groupId, memberId, patch) => crdtUpdateMember(groupId, memberId, patch),
  removeMember: async (groupId, memberId) => crdtRemoveMember(groupId, memberId),

  addExpense: async (groupId, input) => crdtAddExpense(groupId, input),
  updateExpense: async (groupId, expenseId, patch) => crdtUpdateExpense(groupId, expenseId, patch),
  deleteExpense: async (groupId, expenseId) => crdtDeleteExpense(groupId, expenseId),
  restoreExpense: async (groupId, expenseId) => crdtRestoreExpense(groupId, expenseId),
  permanentlyDeleteExpense: async (groupId, expenseId) => crdtPermDeleteExpense(groupId, expenseId),

  addSettlement: async (groupId, input) => crdtAddSettlement(groupId, input),
  deleteSettlement: async (groupId, settlementId) => crdtDeleteSettlement(groupId, settlementId),
}));
