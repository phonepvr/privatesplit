// Greedy debt simplifier. For balances B[member] (positive => is owed; negative => owes),
// produces at most N-1 transfers that converge net positions to zero. Pure function on
// integer minor units; deterministic given a stable iteration order.

export interface NetBalance {
  memberId: string;
  netMinor: number;
}

export interface Transfer {
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
}

export function simplifyDebts(balances: ReadonlyArray<NetBalance>): Transfer[] {
  const sum = balances.reduce((s, b) => s + b.netMinor, 0);
  if (sum !== 0) {
    throw new Error(`balance sum is ${sum}, must be 0`);
  }
  const debtors = balances
    .filter((b) => b.netMinor < 0)
    .map((b) => ({ memberId: b.memberId, remaining: -b.netMinor }))
    .sort((a, b) => (a.memberId < b.memberId ? -1 : 1));
  const creditors = balances
    .filter((b) => b.netMinor > 0)
    .map((b) => ({ memberId: b.memberId, remaining: b.netMinor }))
    .sort((a, b) => (a.memberId < b.memberId ? -1 : 1));

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]!;
    const c = creditors[j]!;
    const pay = Math.min(d.remaining, c.remaining);
    if (pay > 0) {
      transfers.push({ fromMemberId: d.memberId, toMemberId: c.memberId, amountMinor: pay });
    }
    d.remaining -= pay;
    c.remaining -= pay;
    if (d.remaining === 0) i += 1;
    if (c.remaining === 0) j += 1;
  }
  return transfers;
}
