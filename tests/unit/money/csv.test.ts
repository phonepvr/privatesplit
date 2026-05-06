import { describe, expect, it } from 'vitest';
import { exportGroupCsv } from '../../../src/features/export-import/csv';

describe('exportGroupCsv', () => {
  it('produces a UTF-8 BOM and a header row', () => {
    const csv = exportGroupCsv(
      { id: 'g1', name: 'Goa', currency: 'INR', createdAt: '2026-01-01' },
      [{ id: 'a', groupId: 'g1', name: 'Alex', color: '#000' }],
      [],
      []
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('kind,date,description');
  });

  it('quotes commas correctly', () => {
    const csv = exportGroupCsv(
      { id: 'g1', name: 'Goa', currency: 'INR', createdAt: '2026-01-01' },
      [{ id: 'a', groupId: 'g1', name: 'Alex', color: '#000' }],
      [
        {
          id: 'e1',
          groupId: 'g1',
          description: 'Dinner, drinks, dessert',
          amountMinor: 100000,
          date: '2026-01-15',
          category: 'Food',
          paidByMemberId: 'a',
          splitType: 'equal',
          participants: ['a'],
          createdByFingerprint: 'X',
          createdAt: '2026-01-15T00:00:00Z',
          updatedAt: '2026-01-15T00:00:00Z',
        },
      ],
      []
    );
    expect(csv).toMatch(/"Dinner, drinks, dessert"/);
  });
});
