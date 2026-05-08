import { useMemo, useState } from 'react';
import { Header } from '../../app/shell/Header';
import { useGroups } from '../../stores/groups-store';
import { Avatar } from '../../ui/components/Avatar';
import { formatMinor } from '../../core/money/format';

export function ActivityFeed() {
  const groups = useGroups((s) => s.groups);
  const expensesByGroup = useGroups((s) => s.expensesByGroup);
  const settlementsByGroup = useGroups((s) => s.settlementsByGroup);
  const membersByGroup = useGroups((s) => s.membersByGroup);
  const [groupFilter, setGroupFilter] = useState<string>('all');

  const items = useMemo(() => {
    const out: {
      id: string;
      groupId: string;
      groupName: string;
      currency: string;
      date: string;
      kind: 'expense' | 'settlement';
      title: string;
      sub: string;
      amountMinor: number;
      payerName?: string;
      payerColor?: string;
      history?: { field: string; before: unknown; after: unknown; at: string }[];
    }[] = [];
    for (const g of groups) {
      if (groupFilter !== 'all' && groupFilter !== g.id) continue;
      const memberById = new Map((membersByGroup.get(g.id) ?? []).map((m) => [m.id, m]));
      for (const e of expensesByGroup.get(g.id) ?? []) {
        if (e.deletedAt) continue;
        const payer = memberById.get(e.paidByMemberId);
        const item: (typeof out)[number] = {
          id: e.id,
          groupId: g.id,
          groupName: g.name,
          currency: g.currency,
          date: e.date,
          kind: 'expense',
          title: e.description,
          sub: `${payer?.name ?? '?'} · ${g.name} · ${e.category}`,
          amountMinor: e.amountMinor,
        };
        if (payer) {
          item.payerName = payer.name;
          item.payerColor = payer.color;
        }
        if (e.history && e.history.length > 0) item.history = e.history;
        out.push(item);
      }
      for (const s of settlementsByGroup.get(g.id) ?? []) {
        if (s.deletedAt) continue;
        const from = memberById.get(s.fromMemberId);
        const to = memberById.get(s.toMemberId);
        out.push({
          id: s.id,
          groupId: g.id,
          groupName: g.name,
          currency: g.currency,
          date: s.date,
          kind: 'settlement',
          title: `${from?.name ?? '?'} paid ${to?.name ?? '?'}`,
          sub: `Settlement · ${g.name}`,
          amountMinor: s.amountMinor,
        });
      }
    }
    out.sort((a, b) => (a.date < b.date ? 1 : -1));
    return out;
  }, [groups, expensesByGroup, settlementsByGroup, membersByGroup, groupFilter]);

  return (
    <div className="pb-24">
      <Header title="Activity" />
      <div className="mx-auto max-w-md px-4 py-3">
        <select
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="all">All groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Nothing yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((it) => (
              <li
                key={`${it.kind}-${it.id}`}
                className="rounded-xl border border-slate-200 bg-white p-3"
              >
                <div className="flex items-center gap-3">
                  {it.kind === 'expense' ? (
                    <Avatar name={it.payerName ?? '?'} color={it.payerColor} size="sm" />
                  ) : (
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-base">
                      ↻
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">{it.title}</p>
                    <p className="text-xs text-slate-500">
                      {it.sub} · {it.date}
                    </p>
                  </div>
                  <p
                    className={`text-sm font-semibold ${it.amountMinor < 0 ? 'text-emerald-700' : ''}`}
                  >
                    {formatMinor(it.amountMinor, it.currency as 'INR')}
                  </p>
                </div>
                {it.history && it.history.length > 0 && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-slate-500">
                      Show edit history ({it.history.length})
                    </summary>
                    <ul className="mt-1 space-y-1 border-l-2 border-slate-200 pl-3">
                      {it.history.map((h, i) => (
                        <li key={i} className="text-[11px] text-slate-600">
                          <span className="font-mono text-slate-400">
                            {new Date(h.at).toLocaleString()}
                          </span>{' '}
                          · {h.field}: <span className="line-through">{String(h.before)}</span> →{' '}
                          <span className="text-slate-900">{String(h.after)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
