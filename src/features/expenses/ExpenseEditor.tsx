import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../ui/components/Button';
import { Input } from '../../ui/components/Input';
import { Modal } from '../../ui/components/Modal';
import { useGroups } from '../../stores/groups-store';
import { useSession } from '../../stores/session-store';
import { type CurrencyCode } from '../../core/money/types';
import { formatMinor, parseMajorToMinor } from '../../core/money/format';
import { splitEqual, validateExactSplit } from '../../core/money/split';
import type { ExpenseCacheRow, MemberCacheRow } from '../../core/storage/db';

const CATEGORIES = ['Food', 'Travel', 'Accommodation', 'Shopping', 'Other'];

interface Props {
  open: boolean;
  groupId: string;
  currency: CurrencyCode;
  members: MemberCacheRow[];
  initial?: ExpenseCacheRow | null;
  onClose: () => void;
}

export function ExpenseEditor({ open, groupId, currency, members, initial, onClose }: Props) {
  const identity = useSession((s) => s.identity);
  const addExpense = useGroups((s) => s.addExpense);
  const updateExpense = useGroups((s) => s.updateExpense);

  const activeMembers = members.filter((m) => !m.removedAt);

  const [description, setDescription] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState('Other');
  const [notes, setNotes] = useState('');
  const [paidBy, setPaidBy] = useState<string>('');
  const [participants, setParticipants] = useState<Set<string>>(new Set());
  const [splitType, setSplitType] = useState<'equal' | 'exact'>('equal');
  const [exactInputs, setExactInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const descriptionRef = useRef<HTMLInputElement | null>(null);

  // When the modal opens, focus the Description and scroll it into view so the
  // soft keyboard (Android Chrome) doesn't push it above the visible area.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      descriptionRef.current?.focus();
      descriptionRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 50);
    return () => window.clearTimeout(id);
  }, [open]);

  const activeMemberIdsKey = activeMembers.map((m) => m.id).join(',');

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDescription(initial.description);
      setAmountStr(formatRawForEdit(initial.amountMinor, currency));
      setDate(initial.date);
      setCategory(initial.category);
      setNotes(initial.notes ?? '');
      setPaidBy(initial.paidByMemberId);
      setParticipants(new Set(initial.participants));
      setSplitType(initial.splitType);
      const inputs: Record<string, string> = {};
      if (initial.splitType === 'exact' && initial.exactShares) {
        for (const s of initial.exactShares) {
          inputs[s.memberId] = formatRawForEdit(s.amountMinor, currency);
        }
      }
      setExactInputs(inputs);
    } else {
      setDescription('');
      setAmountStr('');
      setDate(new Date().toISOString().slice(0, 10));
      setCategory('Other');
      setNotes('');
      setPaidBy((prev) => {
        // Keep the existing pick if it's still a valid member; otherwise
        // pick the first active member (or empty if there are none).
        if (prev && activeMembers.some((m) => m.id === prev)) return prev;
        return activeMembers[0]?.id ?? '';
      });
      setParticipants((prev) => {
        const valid = new Set([...prev].filter((id) => activeMembers.some((m) => m.id === id)));
        if (valid.size === 0) return new Set(activeMembers.map((m) => m.id));
        // If new members appeared, include them by default for a freshly-opened modal.
        for (const m of activeMembers) valid.add(m.id);
        return valid;
      });
      setSplitType('equal');
      setExactInputs({});
    }
    setError(null);
    // Re-run when the modal opens, the editing target changes, or the
    // available member set changes (this is the fix for the cold-open race
    // where members loaded after the modal opened).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id, activeMemberIdsKey]);

  const amountMinor = useMemo(
    () => parseMajorToMinor(amountStr, currency) ?? 0,
    [amountStr, currency]
  );

  const exactSum = useMemo(() => {
    let sum = 0;
    for (const id of participants) {
      const v = exactInputs[id];
      if (!v) continue;
      const m = parseMajorToMinor(v, currency);
      if (m !== null) sum += m;
    }
    return sum;
  }, [exactInputs, participants, currency]);

  const equalPreview = useMemo(() => {
    if (splitType !== 'equal' || !paidBy) return [];
    return splitEqual({
      totalMinor: amountMinor,
      participants: [...participants],
      payerMemberId: paidBy,
    });
  }, [amountMinor, paidBy, participants, splitType]);

  function toggleParticipant(id: string) {
    const next = new Set(participants);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setParticipants(next);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identity || busy) return;
    setError(null);
    if (!description.trim()) {
      setError('Description required');
      return;
    }
    const parsed = parseMajorToMinor(amountStr, currency);
    if (parsed === null || parsed <= 0) {
      setError('Amount must be a positive number');
      return;
    }
    if (participants.size === 0) {
      setError('Pick at least one participant');
      return;
    }
    let effectivePayer = paidBy;
    if (!effectivePayer && activeMembers.length > 0) {
      effectivePayer = activeMembers[0]!.id;
    }
    if (!effectivePayer) {
      setError('Add at least one member to record an expense.');
      return;
    }
    const trimmedNotes = notes.trim();
    const baseInput: Omit<
      import('../../core/crdt/operations').AddExpenseInput,
      'splitType' | 'exactShares'
    > = {
      description: description.trim(),
      amountMinor: parsed,
      date,
      category,
      paidByMemberId: effectivePayer,
      participants: [...participants],
      createdByFingerprint: identity.fingerprint,
    };
    if (trimmedNotes) baseInput.notes = trimmedNotes;
    if (splitType === 'exact') {
      const shares = [...participants].map((memberId) => {
        const raw = exactInputs[memberId] ?? '0';
        const m = parseMajorToMinor(raw, currency) ?? 0;
        return { memberId, amountMinor: m };
      });
      const v = validateExactSplit({ totalMinor: parsed, shares });
      if (!v.ok) {
        setError(v.reason);
        return;
      }
      setBusy(true);
      try {
        if (initial) {
          await updateExpense(groupId, initial.id, {
            ...baseInput,
            splitType: 'exact',
            exactShares: shares,
          });
        } else {
          await addExpense(groupId, { ...baseInput, splitType: 'exact', exactShares: shares });
        }
        onClose();
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      if (initial) {
        await updateExpense(groupId, initial.id, { ...baseInput, splitType: 'equal' });
      } else {
        await addExpense(groupId, { ...baseInput, splitType: 'equal' });
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit expense' : 'Add expense'}>
      <form className="space-y-3" onSubmit={onSubmit}>
        <Input
          ref={descriptionRef}
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onFocus={(e) => e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' })}
          maxLength={120}
          required
        />
        <Input
          label={`Amount (${currency})`}
          inputMode="decimal"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          onFocus={(e) => e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' })}
          placeholder="0.00"
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base"
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Paid by</span>
          {activeMembers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              No members in this group yet. Add a member or pair a device first.
            </p>
          ) : (
            <select
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base"
            >
              {activeMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.claimedByFingerprint ? ' (paired)' : ' (local only)'}
                </option>
              ))}
            </select>
          )}
        </label>
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Split</span>
          <div className="mb-2 flex gap-2 text-xs">
            <button
              type="button"
              className={`rounded-full px-3 py-1 ${splitType === 'equal' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
              onClick={() => setSplitType('equal')}
            >
              Equal
            </button>
            <button
              type="button"
              className={`rounded-full px-3 py-1 ${splitType === 'exact' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
              onClick={() => setSplitType('exact')}
            >
              Exact amounts
            </button>
          </div>
          <ul className="space-y-1">
            {activeMembers.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`part-${m.id}`}
                  checked={participants.has(m.id)}
                  onChange={() => toggleParticipant(m.id)}
                />
                <label htmlFor={`part-${m.id}`} className="flex-1 text-sm">
                  {m.name}
                </label>
                {splitType === 'exact' && participants.has(m.id) && (
                  <input
                    inputMode="decimal"
                    placeholder="0.00"
                    value={exactInputs[m.id] ?? ''}
                    onChange={(e) => setExactInputs({ ...exactInputs, [m.id]: e.target.value })}
                    className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                )}
                {splitType === 'equal' && participants.has(m.id) && (
                  <span className="w-24 text-right text-xs text-slate-500">
                    {formatMinor(
                      equalPreview.find((p) => p.memberId === m.id)?.amountMinor ?? 0,
                      currency
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {splitType === 'exact' && (
            <p
              className={`mt-2 text-xs ${exactSum === amountMinor ? 'text-emerald-600' : 'text-rose-600'}`}
            >
              Sum: {formatMinor(exactSum, currency)} / {formatMinor(amountMinor, currency)}
            </p>
          )}
        </div>
        <Input label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose} fullWidth>
            Cancel
          </Button>
          <Button type="submit" disabled={busy} fullWidth>
            {busy ? 'Saving…' : initial ? 'Save' : 'Add expense'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function formatRawForEdit(minor: number, currency: CurrencyCode): string {
  const f = currency === 'JPY' ? 1 : 100;
  if (f === 1) return String(minor);
  const major = Math.floor(minor / f);
  const rem = minor % f;
  return `${major}.${String(rem).padStart(2, '0')}`;
}
