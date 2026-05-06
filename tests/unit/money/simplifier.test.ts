import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { simplifyDebts } from '../../../src/core/money/simplifier';

describe('simplifyDebts', () => {
  it('returns no transfers when everyone is at zero', () => {
    expect(
      simplifyDebts([
        { memberId: 'a', netMinor: 0 },
        { memberId: 'b', netMinor: 0 },
      ])
    ).toEqual([]);
  });

  it('handles a simple two-person debt', () => {
    const out = simplifyDebts([
      { memberId: 'a', netMinor: 100 },
      { memberId: 'b', netMinor: -100 },
    ]);
    expect(out).toEqual([{ fromMemberId: 'b', toMemberId: 'a', amountMinor: 100 }]);
  });

  it('collapses a circular debt (A->B, B->C, C->A) to zero transfers', () => {
    const out = simplifyDebts([
      { memberId: 'a', netMinor: 0 },
      { memberId: 'b', netMinor: 0 },
      { memberId: 'c', netMinor: 0 },
    ]);
    expect(out).toEqual([]);
  });

  it('produces ≤ N-1 transfers for N members', () => {
    const balances = [
      { memberId: 'a', netMinor: 100 },
      { memberId: 'b', netMinor: 200 },
      { memberId: 'c', netMinor: -50 },
      { memberId: 'd', netMinor: -250 },
    ];
    const out = simplifyDebts(balances);
    expect(out.length).toBeLessThanOrEqual(balances.length - 1);
    // sum of transfers from each debtor equals their net
    const debtSum: Record<string, number> = {};
    for (const t of out) {
      debtSum[t.fromMemberId] = (debtSum[t.fromMemberId] ?? 0) + t.amountMinor;
    }
    expect(debtSum.c).toBe(50);
    expect(debtSum.d).toBe(250);
  });

  it('throws if balances do not sum to zero', () => {
    expect(() =>
      simplifyDebts([
        { memberId: 'a', netMinor: 100 },
        { memberId: 'b', netMinor: 50 },
      ])
    ).toThrow();
  });

  it('property: post-transfer net is zero everywhere', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 4 }),
            fc.integer({ min: -10000, max: 10000 })
          ),
          { minLength: 2, maxLength: 8 }
        ),
        (raw) => {
          const map = new Map<string, number>();
          for (const [id, v] of raw) map.set(id, (map.get(id) ?? 0) + v);
          const balances = [...map.entries()].map(([memberId, netMinor]) => ({
            memberId,
            netMinor,
          }));
          const sum = balances.reduce((s, b) => s + b.netMinor, 0);
          if (sum !== 0) return true; // skip; we test sum-zero invariants only
          const out = simplifyDebts(balances);
          const finals = new Map(balances.map((b) => [b.memberId, b.netMinor] as const));
          for (const t of out) {
            finals.set(t.fromMemberId, (finals.get(t.fromMemberId) ?? 0) + t.amountMinor);
            finals.set(t.toMemberId, (finals.get(t.toMemberId) ?? 0) - t.amountMinor);
          }
          for (const [, v] of finals) if (v !== 0) return false;
          return true;
        }
      ),
      { numRuns: 200 }
    );
  });
});
