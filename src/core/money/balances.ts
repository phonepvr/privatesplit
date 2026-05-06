import { splitEqual, validateExactSplit, type ParticipantShare, type SplitType } from './split';

export interface ExpenseShape {
  id: string;
  amountMinor: number;
  paidByMemberId: string;
  splitType: SplitType;
  participants: ReadonlyArray<string>;
  exactShares?: ReadonlyArray<ParticipantShare>;
  deletedAt?: string | undefined;
}

export interface SettlementShape {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
  deletedAt?: string | undefined;
}

export interface ComputedBalances {
  perMember: Record<string, number>;
  totalAbs: number;
}

export function computeBalances(
  memberIds: ReadonlyArray<string>,
  expenses: ReadonlyArray<ExpenseShape>,
  settlements: ReadonlyArray<SettlementShape>
): ComputedBalances {
  const perMember: Record<string, number> = {};
  for (const m of memberIds) perMember[m] = 0;

  for (const e of expenses) {
    if (e.deletedAt) continue;
    perMember[e.paidByMemberId] = (perMember[e.paidByMemberId] ?? 0) + e.amountMinor;
    let shares: ParticipantShare[];
    if (e.splitType === 'equal') {
      shares = splitEqual({
        totalMinor: e.amountMinor,
        participants: e.participants,
        payerMemberId: e.paidByMemberId,
      });
    } else {
      const exact = e.exactShares ?? [];
      const v = validateExactSplit({ totalMinor: e.amountMinor, shares: exact });
      if (!v.ok) continue;
      shares = [...exact];
    }
    for (const sh of shares) {
      perMember[sh.memberId] = (perMember[sh.memberId] ?? 0) - sh.amountMinor;
    }
  }

  for (const s of settlements) {
    if (s.deletedAt) continue;
    perMember[s.fromMemberId] = (perMember[s.fromMemberId] ?? 0) + s.amountMinor;
    perMember[s.toMemberId] = (perMember[s.toMemberId] ?? 0) - s.amountMinor;
  }

  let totalAbs = 0;
  for (const v of Object.values(perMember)) totalAbs += Math.abs(v);
  return { perMember, totalAbs: totalAbs / 2 };
}

export interface PairwiseSummary {
  youOwe: { toMemberId: string; amountMinor: number }[];
  oweYou: { fromMemberId: string; amountMinor: number }[];
}
