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
import { destroyGroupDoc, getGroupDoc } from '../core/crdt/group-doc';
import { projectExpense, projectMember, projectSettlement } from '../core/crdt/projections';
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
import { hydrateGroupCache } from '../core/storage/hydration';

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

const EMPTY_MEMBERS: MemberCacheRow[] = [];
const EMPTY_EXPENSES: ExpenseCacheRow[] = [];
const EMPTY_SETTLEMENTS: SettlementCacheRow[] = [];

export function selectMembers(groupId: string) {
  return (s: GroupsState): MemberCacheRow[] => s.membersByGroup.get(groupId) ?? EMPTY_MEMBERS;
}
export function selectExpenses(groupId: string) {
  return (s: GroupsState): ExpenseCacheRow[] => s.expensesByGroup.get(groupId) ?? EMPTY_EXPENSES;
}
export function selectSettlements(groupId: string) {
  return (s: GroupsState): SettlementCacheRow[] =>
    s.settlementsByGroup.get(groupId) ?? EMPTY_SETTLEMENTS;
}

export type SyncStatus = 'idle' | 'opening' | 'exchanging' | 'synced' | 'closed' | 'error';

interface GroupsState {
  groups: GroupRow[];
  membersByGroup: Map<string, MemberCacheRow[]>;
  expensesByGroup: Map<string, ExpenseCacheRow[]>;
  settlementsByGroup: Map<string, SettlementCacheRow[]>;
  hydratedGroupIds: Set<string>;
  detachers: Map<string, () => void>;
  syncStatusByGroup: Map<string, SyncStatus>;
  bootstrap: () => Promise<void>;
  watchGroup: (groupId: string) => Promise<void>;
  unwatchGroup: (groupId: string) => void;
  setSyncStatus: (groupId: string, status: SyncStatus) => void;
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

function compareByDateDesc<T extends { date: string }>(a: T, b: T): number {
  return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
}

export const useGroups = create<GroupsState>((set, get) => {
  function projectAndPublish(groupId: string): void {
    const handle = getGroupDoc(groupId);
    const members: MemberCacheRow[] = handle.members.map((m) => projectMember(groupId, m));
    const expenses: ExpenseCacheRow[] = handle.expenses
      .map((e) => projectExpense(groupId, e))
      .sort(compareByDateDesc);
    const settlements: SettlementCacheRow[] = handle.settlements
      .map((s) => projectSettlement(groupId, s))
      .sort(compareByDateDesc);

    const idMeta = handle.meta.get('id') as string | undefined;
    const groupRow: GroupRow | null = idMeta
      ? {
          id: idMeta,
          name: (handle.meta.get('name') as string) ?? 'Untitled',
          currency: (handle.meta.get('currency') as CurrencyCode) ?? 'INR',
          createdAt: (handle.meta.get('createdAt') as string) ?? new Date().toISOString(),
          ...(handle.meta.get('archivedAt')
            ? { archivedAt: handle.meta.get('archivedAt') as string }
            : {}),
        }
      : null;

    const nextMembers = new Map(get().membersByGroup);
    nextMembers.set(groupId, members);
    const nextExpenses = new Map(get().expensesByGroup);
    nextExpenses.set(groupId, expenses);
    const nextSettlements = new Map(get().settlementsByGroup);
    nextSettlements.set(groupId, settlements);
    const nextGroups = groupRow
      ? (() => {
          const idx = get().groups.findIndex((g) => g.id === groupId);
          const arr = [...get().groups];
          if (idx >= 0) arr[idx] = groupRow;
          else arr.push(groupRow);
          return arr;
        })()
      : get().groups;
    set({
      membersByGroup: nextMembers,
      expensesByGroup: nextExpenses,
      settlementsByGroup: nextSettlements,
      groups: nextGroups,
    });
  }

  function attachYjsObserver(groupId: string): () => void {
    const handle = getGroupDoc(groupId);
    let pendingPersist = false;
    const onChange = () => {
      projectAndPublish(groupId);
      if (!pendingPersist) {
        pendingPersist = true;
        queueMicrotask(() => {
          pendingPersist = false;
          void hydrateGroupCache(groupId).catch((err) => {
            console.error('[PrivShare] Persistence write failed', err);
          });
        });
      }
    };
    handle.meta.observeDeep(onChange);
    handle.members.observeDeep(onChange);
    handle.expenses.observeDeep(onChange);
    handle.settlements.observeDeep(onChange);
    return () => {
      handle.meta.unobserveDeep(onChange);
      handle.members.unobserveDeep(onChange);
      handle.expenses.unobserveDeep(onChange);
      handle.settlements.unobserveDeep(onChange);
    };
  }

  return {
    groups: [],
    membersByGroup: new Map(),
    expensesByGroup: new Map(),
    settlementsByGroup: new Map(),
    hydratedGroupIds: new Set(),
    detachers: new Map(),
    syncStatusByGroup: new Map(),

    bootstrap: async () => {
      if (groupsSub) return;
      groupsSub = liveQuery(() => db().groups.toArray()).subscribe({
        next: (groups) => {
          // Merge Dexie groups with anything we already have in-store, but
          // never overwrite a group entry the Yjs observer just created.
          const live = groups.filter((g) => !g.deletedAt);
          const byId = new Map<string, GroupRow>(live.map((g) => [g.id, g]));
          for (const g of get().groups) byId.set(g.id, byId.get(g.id) ?? g);
          set({ groups: [...byId.values()] });
          for (const g of groups) {
            if (!get().hydratedGroupIds.has(g.id)) void get().watchGroup(g.id);
          }
        },
      });
    },

    watchGroup: async (groupId) => {
      if (get().hydratedGroupIds.has(groupId)) return;
      const claimed = new Set(get().hydratedGroupIds);
      claimed.add(groupId);
      set({ hydratedGroupIds: claimed });

      const handle = getGroupDoc(groupId);
      await handle.ready;
      // Drive the store directly from Yjs going forward.
      const detacher = attachYjsObserver(groupId);
      get().detachers.set(groupId, detacher);
      // Initial publish of whatever is already in the doc.
      projectAndPublish(groupId);
      // Persist current Y.Doc state to the Dexie cache (used only by
      // ActivityFeed for cross-group queries today).
      try {
        await hydrateGroupCache(groupId);
      } catch (err) {
        console.error('[PrivShare] Initial hydration failed', err);
      }
    },

    unwatchGroup: (groupId) => {
      get().detachers.get(groupId)?.();
      get().detachers.delete(groupId);
      const next = new Set(get().hydratedGroupIds);
      next.delete(groupId);
      set({ hydratedGroupIds: next });
    },

    setSyncStatus: (groupId, status) => {
      const next = new Map(get().syncStatusByGroup);
      next.set(groupId, status);
      set({ syncStatusByGroup: next });
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
      const nextGroups = get().groups.filter((g) => g.id !== groupId);
      const nextMembers = new Map(get().membersByGroup);
      nextMembers.delete(groupId);
      const nextExpenses = new Map(get().expensesByGroup);
      nextExpenses.delete(groupId);
      const nextSettlements = new Map(get().settlementsByGroup);
      nextSettlements.delete(groupId);
      set({
        groups: nextGroups,
        membersByGroup: nextMembers,
        expensesByGroup: nextExpenses,
        settlementsByGroup: nextSettlements,
      });
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
    updateExpense: async (groupId, expenseId, patch) =>
      crdtUpdateExpense(groupId, expenseId, patch),
    deleteExpense: async (groupId, expenseId) => crdtDeleteExpense(groupId, expenseId),
    restoreExpense: async (groupId, expenseId) => crdtRestoreExpense(groupId, expenseId),
    permanentlyDeleteExpense: async (groupId, expenseId) =>
      crdtPermDeleteExpense(groupId, expenseId),

    addSettlement: async (groupId, input) => crdtAddSettlement(groupId, input),
    deleteSettlement: async (groupId, settlementId) => crdtDeleteSettlement(groupId, settlementId),
  };
});
