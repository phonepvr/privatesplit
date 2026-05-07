import { useEffect, useMemo, useState } from 'react';
import { Header } from '../../app/shell/Header';
import { Button } from '../../ui/components/Button';
import { Avatar } from '../../ui/components/Avatar';
import {
  selectExpenses,
  selectMembers,
  selectSettlements,
  useGroups,
} from '../../stores/groups-store';
import { useSession } from '../../stores/session-store';
import { ExpenseEditor } from '../expenses/ExpenseEditor';
import { SettlementEditor } from '../settlements/SettlementEditor';
import { MembersEditor } from '../members/MembersEditor';
import { BalanceLine } from '../balances/BalanceLine';
import { formatMinor } from '../../core/money/format';
import { exportGroupCsv, downloadCsv } from '../export-import/csv';
import { exportGroupAsBlob } from '../export-import/privshare';
import { SyncPill } from '../pairing/SyncPill';
import type { ExpenseCacheRow } from '../../core/storage/db';

interface Props {
  groupId: string;
  onBack: () => void;
}

export function GroupDetail({ groupId, onBack }: Props) {
  const groups = useGroups((s) => s.groups);
  const members = useGroups(useMemo(() => selectMembers(groupId), [groupId]));
  const expenses = useGroups(useMemo(() => selectExpenses(groupId), [groupId]));
  const settlements = useGroups(useMemo(() => selectSettlements(groupId), [groupId]));
  const renameGroup = useGroups((s) => s.renameGroup);
  const archiveGroup = useGroups((s) => s.archiveGroup);
  const deleteGroup = useGroups((s) => s.deleteGroup);
  const deleteExpense = useGroups((s) => s.deleteExpense);
  const deleteSettlement = useGroups((s) => s.deleteSettlement);
  const identity = useSession((s) => s.identity);

  const group = groups.find((g) => g.id === groupId);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const selfMemberId = useMemo(
    () => members.find((m) => m.claimedByFingerprint === identity?.fingerprint)?.id ?? null,
    [members, identity]
  );

  const [showAdd, setShowAdd] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const [editing, setEditing] = useState<ExpenseCacheRow | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  // Ensure observers/subscriptions are attached even if the user navigates
  // here before bootstrap's liveQuery has caught up to a freshly-created group.
  const watchGroup = useGroups((s) => s.watchGroup);
  useEffect(() => {
    void watchGroup(groupId);
  }, [groupId, watchGroup]);

  if (!group) {
    return (
      <div>
        <Header title="Loading…" back={onBack} />
        <p className="p-4 text-sm text-slate-500">Opening group…</p>
      </div>
    );
  }

  const visibleExpenses = expenses.filter((e) => !e.deletedAt);
  const visibleSettlements = settlements.filter((s) => !s.deletedAt);

  return (
    <div className="pb-32">
      <Header
        title={group.name}
        back={onBack}
        right={
          <>
            <SyncPill groupId={groupId} />
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100"
              aria-label="More"
            >
              ⋯
            </button>
          </>
        }
      />
      {showMenu && (
        <div className="mx-auto max-w-md px-4">
          <div className="my-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowMenu(false);
                  setShowMembers(true);
                }}
              >
                Members ({members.filter((m) => !m.removedAt).length})
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const name = prompt('Rename group', group.name);
                  if (name && name.trim()) void renameGroup(groupId, name.trim());
                  setShowMenu(false);
                }}
              >
                Rename
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  void archiveGroup(groupId, !group.archivedAt);
                  setShowMenu(false);
                }}
              >
                {group.archivedAt ? 'Unarchive' : 'Archive'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const csv = exportGroupCsv(group, members, visibleExpenses, visibleSettlements);
                  downloadCsv(`${group.name.replace(/\s+/g, '-')}.csv`, csv);
                  setShowMenu(false);
                }}
              >
                Export CSV
              </Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  if (!identity) return;
                  const blob = await exportGroupAsBlob(groupId, identity);
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `${group.name.replace(/\s+/g, '-')}.privshare`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                  setShowMenu(false);
                }}
              >
                Export .privshare
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (confirm(`Permanently delete "${group.name}" and all its data?`)) {
                    void deleteGroup(groupId).then(onBack);
                  }
                  setShowMenu(false);
                }}
              >
                Delete group
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-md px-4 py-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">Balance</p>
          <BalanceLine
            selfMemberId={selfMemberId}
            members={members}
            expenses={expenses}
            settlements={settlements}
            currency={group.currency}
          />
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => setShowSettle(true)}>
              Settle up
            </Button>
          </div>
        </div>

        {members.filter((m) => !m.removedAt).length < 2 && (
          <div className="mt-3 rounded-xl border border-dashed border-sky-300 bg-sky-50 p-4 text-sm text-sky-900">
            <p className="font-semibold">Add the people you split with</p>
            <p className="mt-1 text-xs text-sky-800">
              You need at least one other member to split expenses.
            </p>
            <Button className="mt-3" onClick={() => setShowMembers(true)}>
              + Add a member
            </Button>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Activity</h2>
          <Button
            onClick={() => {
              setEditing(null);
              setShowAdd(true);
            }}
          >
            + Add expense
          </Button>
        </div>

        {visibleExpenses.length === 0 && visibleSettlements.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            No expenses yet. Tap “Add expense” to log your first one.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {[
              ...visibleExpenses.map((e) => ({ kind: 'expense' as const, row: e })),
              ...visibleSettlements.map((s) => ({ kind: 'settlement' as const, row: s })),
            ]
              .sort((a, b) => (a.row.date < b.row.date ? 1 : -1))
              .map((item) => {
                if (item.kind === 'expense') {
                  const e = item.row;
                  const payer = memberById.get(e.paidByMemberId);
                  return (
                    <li
                      key={e.id}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <Avatar name={payer?.name ?? '?'} color={payer?.color} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {e.description}
                        </p>
                        <p className="text-xs text-slate-500">
                          {payer?.name ?? '?'} paid · {e.date} · {e.category}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {formatMinor(e.amountMinor, group.currency)}
                        </p>
                        <button
                          onClick={() => {
                            setEditing(e);
                            setShowAdd(true);
                          }}
                          className="text-xs text-sky-600"
                        >
                          Edit
                        </button>
                        <span className="mx-1 text-slate-300">·</span>
                        <button
                          onClick={() => {
                            if (confirm(`Move "${e.description}" to trash?`)) {
                              void deleteExpense(groupId, e.id);
                            }
                          }}
                          className="text-xs text-rose-600"
                        >
                          Trash
                        </button>
                      </div>
                    </li>
                  );
                }
                const s = item.row;
                const from = memberById.get(s.fromMemberId);
                const to = memberById.get(s.toMemberId);
                return (
                  <li
                    key={s.id}
                    className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3"
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-base">
                      ↻
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">{from?.name ?? '?'}</span> paid{' '}
                        <span className="font-medium">{to?.name ?? '?'}</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {s.date}
                        {s.note ? ` · ${s.note}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">
                        {formatMinor(s.amountMinor, group.currency)}
                      </p>
                      <button
                        onClick={() => {
                          if (confirm('Delete this settlement?'))
                            void deleteSettlement(groupId, s.id);
                        }}
                        className="text-xs text-rose-600"
                      >
                        Trash
                      </button>
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </div>

      <ExpenseEditor
        open={showAdd}
        groupId={groupId}
        currency={group.currency}
        members={members}
        initial={editing}
        onClose={() => {
          setShowAdd(false);
          setEditing(null);
        }}
      />
      <SettlementEditor
        open={showSettle}
        groupId={groupId}
        currency={group.currency}
        members={members}
        onClose={() => setShowSettle(false)}
      />
      <MembersEditor
        open={showMembers}
        groupId={groupId}
        members={members}
        onClose={() => setShowMembers(false)}
      />
    </div>
  );
}
