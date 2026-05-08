export type SplitType = 'equal' | 'exact' | 'percentage' | 'shares' | 'adjustments';

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

// === SplitPro-equivalent split types ===

export interface PercentageEntry {
  memberId: string;
  /** Percentage (0..100). May have fractional part. The set must sum to 100. */
  pct: number;
}

export interface PercentageSplitInput {
  totalMinor: number;
  payerMemberId: string;
  entries: ReadonlyArray<PercentageEntry>;
}

/** Split totalMinor by percentages; rounding remainder is absorbed by the
 *  payer entry (or first entry if the payer isn't a participant). */
export function splitPercentage(input: PercentageSplitInput): ParticipantShare[] {
  if (!Number.isInteger(input.totalMinor)) throw new Error('totalMinor must be integer');
  if (input.entries.length === 0) return [];
  const sum = input.entries.reduce((s, e) => s + e.pct, 0);
  if (Math.abs(sum - 100) > 0.0001) {
    throw new Error(`percentages must sum to 100 (got ${sum})`);
  }
  const provisional = input.entries.map((e) => ({
    memberId: e.memberId,
    amountMinor: Math.trunc((input.totalMinor * e.pct) / 100),
  }));
  const allocated = provisional.reduce((s, sh) => s + sh.amountMinor, 0);
  const remainder = input.totalMinor - allocated;
  if (remainder !== 0) {
    const idx = Math.max(
      0,
      provisional.findIndex((sh) => sh.memberId === input.payerMemberId)
    );
    provisional[idx] = {
      memberId: provisional[idx]!.memberId,
      amountMinor: provisional[idx]!.amountMinor + remainder,
    };
  }
  return provisional;
}

export interface ShareEntry {
  memberId: string;
  /** Non-negative integer weight. */
  weight: number;
}

export interface SharesSplitInput {
  totalMinor: number;
  payerMemberId: string;
  entries: ReadonlyArray<ShareEntry>;
}

/** Split totalMinor pro-rata to integer weights. */
export function splitShares(input: SharesSplitInput): ParticipantShare[] {
  if (!Number.isInteger(input.totalMinor)) throw new Error('totalMinor must be integer');
  if (input.entries.length === 0) return [];
  for (const e of input.entries) {
    if (!Number.isInteger(e.weight) || e.weight < 0)
      throw new Error('weights must be non-negative integers');
  }
  const totalWeight = input.entries.reduce((s, e) => s + e.weight, 0);
  if (totalWeight === 0) throw new Error('total weight is zero — at least one share required');
  const provisional = input.entries.map((e) => ({
    memberId: e.memberId,
    amountMinor: Math.trunc((input.totalMinor * e.weight) / totalWeight),
  }));
  const allocated = provisional.reduce((s, sh) => s + sh.amountMinor, 0);
  const remainder = input.totalMinor - allocated;
  if (remainder !== 0) {
    const idx = Math.max(
      0,
      provisional.findIndex((sh) => sh.memberId === input.payerMemberId)
    );
    provisional[idx] = {
      memberId: provisional[idx]!.memberId,
      amountMinor: provisional[idx]!.amountMinor + remainder,
    };
  }
  return provisional;
}

export interface AdjustmentEntry {
  memberId: string;
  /** Per-member adjustment in minor units. May be negative. */
  deltaMinor: number;
}

export interface AdjustmentsSplitInput {
  totalMinor: number;
  payerMemberId: string;
  participants: ReadonlyArray<string>;
  adjustments: ReadonlyArray<AdjustmentEntry>;
}

/** Equal split, then per-member ± deltas. The deltas must NET to zero so
 *  the share total still equals totalMinor. */
export function splitAdjustments(input: AdjustmentsSplitInput): ParticipantShare[] {
  if (!Number.isInteger(input.totalMinor)) throw new Error('totalMinor must be integer');
  if (input.participants.length === 0) return [];
  const adjSum = input.adjustments.reduce((s, a) => s + a.deltaMinor, 0);
  if (adjSum !== 0) {
    throw new Error(`adjustments must net to zero (got ${adjSum})`);
  }
  const adjBy = new Map(input.adjustments.map((a) => [a.memberId, a.deltaMinor]));
  const equal = splitEqual({
    totalMinor: input.totalMinor,
    participants: input.participants,
    payerMemberId: input.payerMemberId,
  });
  return equal.map((sh) => ({
    memberId: sh.memberId,
    amountMinor: sh.amountMinor + (adjBy.get(sh.memberId) ?? 0),
  }));
}
