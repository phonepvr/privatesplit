import { computeBalances } from '../../core/money/balances';
import { formatMinor } from '../../core/money/format';
import { simplifyDebts } from '../../core/money/simplifier';
import type { CurrencyCode } from '../../core/money/types';
import type { ExpenseCacheRow, MemberCacheRow, SettlementCacheRow } from '../../core/storage/db';

interface Props {
  selfMemberId: string | null;
  members: MemberCacheRow[];
  expenses: ExpenseCacheRow[];
  settlements: SettlementCacheRow[];
  currency: CurrencyCode;
}

export function BalanceLine({ selfMemberId, members, expenses, settlements, currency }: Props) {
  const memberIds = members.map((m) => m.id);
  const balances = computeBalances(memberIds, expenses, settlements);
  const activeMembers = members.filter((m) => !m.removedAt);

  if (activeMembers.length === 0) {
    return <p className="text-sm text-slate-500">No members yet.</p>;
  }

  if (activeMembers.length === 2 && selfMemberId) {
    const self = activeMembers.find((m) => m.id === selfMemberId);
    const other = activeMembers.find((m) => m.id !== selfMemberId);
    if (!self || !other) return <p className="text-sm text-slate-500">All settled.</p>;
    const net = balances.perMember[self.id] ?? 0;
    if (net === 0) {
      return <p className="text-base font-semibold text-emerald-700">All settled.</p>;
    }
    if (net > 0) {
      return (
        <p className="text-base font-semibold text-emerald-700">
          {other.name} owes you {formatMinor(net, currency)}.
        </p>
      );
    }
    return (
      <p className="text-base font-semibold text-rose-700">
        You owe {other.name} {formatMinor(-net, currency)}.
      </p>
    );
  }

  const transfers = simplifyDebts(
    activeMembers.map((m) => ({ memberId: m.id, netMinor: balances.perMember[m.id] ?? 0 }))
  );
  if (transfers.length === 0) {
    return <p className="text-base font-semibold text-emerald-700">All settled.</p>;
  }
  const byId = new Map(activeMembers.map((m) => [m.id, m.name]));
  return (
    <ul className="space-y-1">
      {transfers.map((t, i) => (
        <li key={i} className="text-sm text-slate-700">
          <span className="font-semibold">{byId.get(t.fromMemberId)}</span> owes{' '}
          <span className="font-semibold">{byId.get(t.toMemberId)}</span>{' '}
          <span className="font-semibold text-slate-900">
            {formatMinor(t.amountMinor, currency)}
          </span>
        </li>
      ))}
    </ul>
  );
}
