import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { splitEqual, validateExactSplit } from '../../../src/core/money/split';

describe('splitEqual', () => {
  it('splits 1000 paise between two members evenly', () => {
    const out = splitEqual({ totalMinor: 1000, participants: ['a', 'b'], payerMemberId: 'a' });
    expect(out).toEqual([
      { memberId: 'a', amountMinor: 500 },
      { memberId: 'b', amountMinor: 500 },
    ]);
  });

  it('distributes remainders starting at the payer', () => {
    const out = splitEqual({ totalMinor: 1001, participants: ['a', 'b'], payerMemberId: 'a' });
    expect(out).toEqual([
      { memberId: 'a', amountMinor: 501 },
      { memberId: 'b', amountMinor: 500 },
    ]);
  });

  it('handles 1 paise / 3 people deterministically', () => {
    const out = splitEqual({ totalMinor: 1, participants: ['a', 'b', 'c'], payerMemberId: 'b' });
    const sum = out.reduce((s, sh) => s + sh.amountMinor, 0);
    expect(sum).toBe(1);
    expect(out.find((s) => s.memberId === 'b')?.amountMinor).toBe(1);
    expect(out.find((s) => s.memberId === 'a')?.amountMinor).toBe(0);
    expect(out.find((s) => s.memberId === 'c')?.amountMinor).toBe(0);
  });

  it('handles N=4', () => {
    const out = splitEqual({
      totalMinor: 1003,
      participants: ['a', 'b', 'c', 'd'],
      payerMemberId: 'a',
    });
    const sum = out.reduce((s, sh) => s + sh.amountMinor, 0);
    expect(sum).toBe(1003);
  });

  it('handles N=5', () => {
    const out = splitEqual({
      totalMinor: 17,
      participants: ['a', 'b', 'c', 'd', 'e'],
      payerMemberId: 'c',
    });
    const sum = out.reduce((s, sh) => s + sh.amountMinor, 0);
    expect(sum).toBe(17);
  });

  it('handles N=7 with remainder', () => {
    const out = splitEqual({
      totalMinor: 1003,
      participants: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      payerMemberId: 'd',
    });
    expect(out.reduce((s, sh) => s + sh.amountMinor, 0)).toBe(1003);
  });

  it('handles a single member group', () => {
    const out = splitEqual({ totalMinor: 500, participants: ['a'], payerMemberId: 'a' });
    expect(out).toEqual([{ memberId: 'a', amountMinor: 500 }]);
  });

  it('returns empty when participants are empty', () => {
    const out = splitEqual({ totalMinor: 0, participants: [], payerMemberId: 'a' });
    expect(out).toEqual([]);
  });

  it('rejects non-integer totals', () => {
    expect(() =>
      splitEqual({ totalMinor: 1.5, participants: ['a', 'b'], payerMemberId: 'a' })
    ).toThrow();
  });

  it('handles negative totals (refund-like) deterministically', () => {
    const out = splitEqual({ totalMinor: -101, participants: ['a', 'b', 'c'], payerMemberId: 'a' });
    expect(out.reduce((s, sh) => s + sh.amountMinor, 0)).toBe(-101);
  });

  it('handles large amounts near MAX_SAFE_INTEGER/100', () => {
    const big = Math.floor(Number.MAX_SAFE_INTEGER / 100);
    const out = splitEqual({ totalMinor: big, participants: ['a', 'b', 'c'], payerMemberId: 'a' });
    expect(out.reduce((s, sh) => s + sh.amountMinor, 0)).toBe(big);
  });

  it('property: sum of shares always equals total', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.array(fc.string({ minLength: 1, maxLength: 5 }), { minLength: 1, maxLength: 12 }),
        (total, ids) => {
          const unique = Array.from(new Set(ids));
          if (unique.length === 0) return true;
          const out = splitEqual({
            totalMinor: total,
            participants: unique,
            payerMemberId: unique[0]!,
          });
          return out.reduce((s, sh) => s + sh.amountMinor, 0) === total;
        }
      ),
      { numRuns: 200 }
    );
  });
});

describe('validateExactSplit', () => {
  it('accepts a matching split', () => {
    const v = validateExactSplit({
      totalMinor: 100,
      shares: [
        { memberId: 'a', amountMinor: 60 },
        { memberId: 'b', amountMinor: 40 },
      ],
    });
    expect(v.ok).toBe(true);
  });
  it('rejects mismatched sums', () => {
    const v = validateExactSplit({
      totalMinor: 100,
      shares: [
        { memberId: 'a', amountMinor: 60 },
        { memberId: 'b', amountMinor: 30 },
      ],
    });
    expect(v.ok).toBe(false);
  });
  it('rejects non-integer shares', () => {
    const v = validateExactSplit({
      totalMinor: 100,
      shares: [
        { memberId: 'a', amountMinor: 60.5 },
        { memberId: 'b', amountMinor: 39.5 },
      ],
    });
    expect(v.ok).toBe(false);
  });
});

import { splitAdjustments, splitPercentage, splitShares } from '../../../src/core/money/split';

describe('splitPercentage', () => {
  it('splits 1000 by 50/50', () => {
    const out = splitPercentage({
      totalMinor: 1000,
      payerMemberId: 'a',
      entries: [
        { memberId: 'a', pct: 50 },
        { memberId: 'b', pct: 50 },
      ],
    });
    expect(out.reduce((s, sh) => s + sh.amountMinor, 0)).toBe(1000);
  });
  it('absorbs rounding into payer', () => {
    // 100 / 3 -> not exact. Payer gets the leftover paise.
    const out = splitPercentage({
      totalMinor: 100,
      payerMemberId: 'a',
      entries: [
        { memberId: 'a', pct: 33.33 },
        { memberId: 'b', pct: 33.33 },
        { memberId: 'c', pct: 33.34 },
      ],
    });
    expect(out.reduce((s, sh) => s + sh.amountMinor, 0)).toBe(100);
  });
  it('rejects when percentages do not sum to 100', () => {
    expect(() =>
      splitPercentage({
        totalMinor: 100,
        payerMemberId: 'a',
        entries: [
          { memberId: 'a', pct: 50 },
          { memberId: 'b', pct: 40 },
        ],
      })
    ).toThrow();
  });
});

describe('splitShares', () => {
  it('splits 1000 by 1:2 weights', () => {
    const out = splitShares({
      totalMinor: 1000,
      payerMemberId: 'a',
      entries: [
        { memberId: 'a', weight: 1 },
        { memberId: 'b', weight: 2 },
      ],
    });
    expect(out.reduce((s, sh) => s + sh.amountMinor, 0)).toBe(1000);
    expect(out.find((sh) => sh.memberId === 'b')!.amountMinor).toBeGreaterThan(
      out.find((sh) => sh.memberId === 'a')!.amountMinor
    );
  });
  it('rejects negative weights', () => {
    expect(() =>
      splitShares({
        totalMinor: 100,
        payerMemberId: 'a',
        entries: [
          { memberId: 'a', weight: -1 },
          { memberId: 'b', weight: 2 },
        ],
      })
    ).toThrow();
  });
  it('rejects all-zero weights', () => {
    expect(() =>
      splitShares({
        totalMinor: 100,
        payerMemberId: 'a',
        entries: [
          { memberId: 'a', weight: 0 },
          { memberId: 'b', weight: 0 },
        ],
      })
    ).toThrow();
  });
});

describe('splitAdjustments', () => {
  it('applies deltas on top of equal split', () => {
    const out = splitAdjustments({
      totalMinor: 1000,
      payerMemberId: 'a',
      participants: ['a', 'b'],
      adjustments: [
        { memberId: 'a', deltaMinor: -100 },
        { memberId: 'b', deltaMinor: 100 },
      ],
    });
    expect(out.reduce((s, sh) => s + sh.amountMinor, 0)).toBe(1000);
    expect(out.find((sh) => sh.memberId === 'a')!.amountMinor).toBe(400);
    expect(out.find((sh) => sh.memberId === 'b')!.amountMinor).toBe(600);
  });
  it('rejects when deltas do not net to zero', () => {
    expect(() =>
      splitAdjustments({
        totalMinor: 1000,
        payerMemberId: 'a',
        participants: ['a', 'b'],
        adjustments: [{ memberId: 'a', deltaMinor: 50 }],
      })
    ).toThrow();
  });
});
