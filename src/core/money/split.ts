export type SplitType = 'equal' | 'exact';

export interface ParticipantShare {
  memberId: string;
  amountMinor: number;
}

export interface EqualSplitInput {
  totalMinor: number;
  participants: ReadonlyArray<string>;
  payerMemberId: string;
}

export interface ExactSplitInput {
  totalMinor: number;
  shares: ReadonlyArray<ParticipantShare>;
}

export function splitEqual(input: EqualSplitInput): ParticipantShare[] {
  const { totalMinor, participants, payerMemberId } = input;
  if (participants.length === 0) return [];
  if (!Number.isInteger(totalMinor)) {
    throw new Error('totalMinor must be an integer');
  }
  const base = Math.trunc(totalMinor / participants.length);
  const remainder = totalMinor - base * participants.length;
  const ordered = [...participants];
  const payerIdx = ordered.indexOf(payerMemberId);
  const remainderHolders = new Set<number>();
  if (remainder !== 0) {
    const sign = remainder > 0 ? 1 : -1;
    let extra = Math.abs(remainder);
    const start = payerIdx >= 0 ? payerIdx : 0;
    let i = start;
    const seen = new Set<number>();
    while (extra > 0 && seen.size < ordered.length) {
      remainderHolders.add(i);
      seen.add(i);
      extra -= 1;
      i = (i + 1) % ordered.length;
    }
    return ordered.map((memberId, idx) => ({
      memberId,
      amountMinor: base + (remainderHolders.has(idx) ? sign : 0),
    }));
  }
  return ordered.map((memberId) => ({ memberId, amountMinor: base }));
}

export function validateExactSplit(
  input: ExactSplitInput
): { ok: true } | { ok: false; reason: string } {
  const sum = input.shares.reduce((s, sh) => s + sh.amountMinor, 0);
  if (!Number.isInteger(input.totalMinor))
    return { ok: false, reason: 'total must be integer minor units' };
  for (const sh of input.shares) {
    if (!Number.isInteger(sh.amountMinor))
      return { ok: false, reason: 'each share must be integer minor units' };
  }
  if (sum !== input.totalMinor) {
    return { ok: false, reason: `shares sum to ${sum} but total is ${input.totalMinor}` };
  }
  return { ok: true };
}
