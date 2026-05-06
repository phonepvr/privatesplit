import { useState } from 'react';
import { Button } from '../../ui/components/Button';
import { Input } from '../../ui/components/Input';
import { Modal } from '../../ui/components/Modal';
import { useGroups } from '../../stores/groups-store';
import { useSession } from '../../stores/session-store';
import type { CurrencyCode } from '../../core/money/types';
import type { MemberCacheRow } from '../../core/storage/db';
import { parseMajorToMinor } from '../../core/money/format';

interface Props {
  open: boolean;
  groupId: string;
  currency: CurrencyCode;
  members: MemberCacheRow[];
  prefill?: { fromMemberId: string; toMemberId: string; amountMinor: number };
  onClose: () => void;
}

export function SettlementEditor({ open, groupId, currency, members, prefill, onClose }: Props) {
  const identity = useSession((s) => s.identity);
  const addSettlement = useGroups((s) => s.addSettlement);

  const active = members.filter((m) => !m.removedAt);
  const [from, setFrom] = useState<string>(prefill?.fromMemberId ?? active[0]?.id ?? '');
  const [to, setTo] = useState<string>(prefill?.toMemberId ?? active[1]?.id ?? '');
  const [amountStr, setAmountStr] = useState<string>(
    prefill ? formatPrefill(prefill.amountMinor, currency) : ''
  );
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identity || busy) return;
    if (from === to) {
      setError('Pick two different people');
      return;
    }
    const minor = parseMajorToMinor(amountStr, currency);
    if (minor === null || minor <= 0) {
      setError('Amount must be positive');
      return;
    }
    setBusy(true);
    try {
      const input: {
        fromMemberId: string;
        toMemberId: string;
        amountMinor: number;
        date: string;
        note?: string;
        createdByFingerprint: string;
      } = {
        fromMemberId: from,
        toMemberId: to,
        amountMinor: minor,
        date,
        createdByFingerprint: identity.fingerprint,
      };
      if (note.trim()) input.note = note.trim();
      await addSettlement(groupId, input);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Record a settlement">
      <form className="space-y-3" onSubmit={onSubmit}>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">From</span>
            <select
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base"
            >
              {active.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">To</span>
            <select
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base"
            >
              {active.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Input
          label={`Amount (${currency})`}
          inputMode="decimal"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          required
        />
        <Input
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose} fullWidth>
            Cancel
          </Button>
          <Button type="submit" disabled={busy} fullWidth>
            {busy ? 'Saving…' : 'Record settlement'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function formatPrefill(minor: number, currency: CurrencyCode): string {
  const f = currency === 'JPY' ? 1 : 100;
  if (f === 1) return String(minor);
  return `${Math.floor(minor / f)}.${String(minor % f).padStart(2, '0')}`;
}
