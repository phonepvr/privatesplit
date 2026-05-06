import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeBalances } from '../../../src/core/money/balances';

describe('computeBalances', () => {
  it('returns zero balances for an empty group', () => {
    const r = computeBalances(['a', 'b'], [], []);
    expect(r.perMember).toEqual({ a: 0, b: 0 });
    expect(r.totalAbs).toBe(0);
  });

  it('handles a single equal expense at N=2', () => {
    const r = computeBalances(
      ['a', 'b'],
      [
        {
          id: 'e1',
          amountMinor: 1000,
          paidByMemberId: 'a',
          splitType: 'equal',
          participants: ['a', 'b'],
        },
      ],
      []
    );
    expect(r.perMember.a).toBe(500);
    expect(r.perMember.b).toBe(-500);
  });

  it('settlement reduces balance', () => {
    const r = computeBalances(
      ['a', 'b'],
      [
        {
          id: 'e1',
          amountMinor: 1000,
          paidByMemberId: 'a',
          splitType: 'equal',
          participants: ['a', 'b'],
        },
      ],
      [{ id: 's1', fromMemberId: 'b', toMemberId: 'a', amountMinor: 500 }]
    );
    expect(r.perMember.a).toBe(0);
    expect(r.perMember.b).toBe(0);
  });

  it('ignores deleted expenses', () => {
    const r = computeBalances(
      ['a', 'b'],
      [
        {
          id: 'e1',
          amountMinor: 1000,
          paidByMemberId: 'a',
          splitType: 'equal',
          participants: ['a', 'b'],
          deletedAt: '2026-01-01T00:00:00Z',
        },
      ],
      []
    );
    expect(r.perMember.a).toBe(0);
    expect(r.perMember.b).toBe(0);
  });

  it('handles unequal splits', () => {
    const r = computeBalances(
      ['a', 'b'],
      [
        {
          id: 'e1',
          amountMinor: 1000,
          paidByMemberId: 'a',
          splitType: 'exact',
          participants: ['a', 'b'],
          exactShares: [
            { memberId: 'a', amountMinor: 400 },
            { memberId: 'b', amountMinor: 600 },
          ],
        },
      ],
      []
    );
    expect(r.perMember.a).toBe(600);
    expect(r.perMember.b).toBe(-600);
  });

  it('property: sum of all balances is zero', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            amountMinor: fc.integer({ min: 1, max: 100000 }),
            paidByIdx: fc.integer({ min: 0, max: 4 }),
            participants: fc.subarray(['m0', 'm1', 'm2', 'm3', 'm4'], {
              minLength: 1,
              maxLength: 5,
            }),
          }),
          { minLength: 0, maxLength: 30 }
        ),
        (rawExpenses) => {
          const memberIds = ['m0', 'm1', 'm2', 'm3', 'm4'];
          const expenses = rawExpenses.map((e, i) => {
            const payer = memberIds[e.paidByIdx % memberIds.length]!;
            const participants = e.participants.length ? e.participants : [payer];
            return {
              id: `e${i}`,
              amountMinor: e.amountMinor,
              paidByMemberId: payer,
              splitType: 'equal' as const,
              participants,
            };
          });
          const r = computeBalances(memberIds, expenses, []);
          const total = Object.values(r.perMember).reduce((s, v) => s + v, 0);
          return total === 0;
        }
      ),
      { numRuns: 200 }
    );
  });

  it('handles many mixed payers across N=5', () => {
    const r = computeBalances(
      ['a', 'b', 'c', 'd', 'e'],
      [
        {
          id: '1',
          amountMinor: 500,
          paidByMemberId: 'a',
          splitType: 'equal',
          participants: ['a', 'b', 'c', 'd', 'e'],
        },
        {
          id: '2',
          amountMinor: 200,
          paidByMemberId: 'b',
          splitType: 'equal',
          participants: ['a', 'b'],
        },
        {
          id: '3',
          amountMinor: 300,
          paidByMemberId: 'c',
          splitType: 'equal',
          participants: ['c', 'd', 'e'],
        },
      ],
      []
    );
    const sum = Object.values(r.perMember).reduce((s, v) => s + v, 0);
    expect(sum).toBe(0);
  });
});
