import type {
  ExpenseCacheRow,
  GroupRow,
  MemberCacheRow,
  SettlementCacheRow,
} from '../../core/storage/db';
import { formatMinor } from '../../core/money/format';

function csvField(s: string | number | undefined | null): string {
  if (s === undefined || s === null) return '';
  const str = String(s);
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function exportGroupCsv(
  group: GroupRow,
  members: MemberCacheRow[],
  expenses: ExpenseCacheRow[],
  settlements: SettlementCacheRow[]
): string {
  const memberById = new Map(members.map((m) => [m.id, m]));
  const lines: string[] = [];
  lines.push(
    [
      'kind',
      'date',
      'description',
      'category',
      'amount_minor',
      'amount_formatted',
      'currency',
      'paid_by',
      'from',
      'to',
      'participants',
      'split_type',
      'split_breakdown',
      'notes',
    ]
      .map(csvField)
      .join(',')
  );
  for (const e of expenses) {
    const breakdown =
      e.splitType === 'exact' && e.exactShares
        ? e.exactShares
            .map(
              (s) =>
                `${memberById.get(s.memberId)?.name ?? s.memberId}=${formatMinor(s.amountMinor, group.currency)}`
            )
            .join(' ; ')
        : e.participants.map((id) => memberById.get(id)?.name ?? id).join(' ; ');
    lines.push(
      [
        'expense',
        e.date,
        e.description,
        e.category,
        e.amountMinor,
        formatMinor(e.amountMinor, group.currency),
        group.currency,
        memberById.get(e.paidByMemberId)?.name ?? e.paidByMemberId,
        '',
        '',
        e.participants.map((id) => memberById.get(id)?.name ?? id).join(' ; '),
        e.splitType,
        breakdown,
        e.notes ?? '',
      ]
        .map(csvField)
        .join(',')
    );
  }
  for (const s of settlements) {
    lines.push(
      [
        'settlement',
        s.date,
        '',
        '',
        s.amountMinor,
        formatMinor(s.amountMinor, group.currency),
        group.currency,
        '',
        memberById.get(s.fromMemberId)?.name ?? s.fromMemberId,
        memberById.get(s.toMemberId)?.name ?? s.toMemberId,
        '',
        '',
        '',
        s.note ?? '',
      ]
        .map(csvField)
        .join(',')
    );
  }
  return '﻿' + lines.join('\r\n');
}

export function downloadCsv(filename: string, body: string): void {
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
