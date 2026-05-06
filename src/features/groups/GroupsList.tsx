import { useState } from 'react';
import { Button } from '../../ui/components/Button';
import { Input } from '../../ui/components/Input';
import { Modal } from '../../ui/components/Modal';
import { Header } from '../../app/shell/Header';
import { useGroups } from '../../stores/groups-store';
import { useSession } from '../../stores/session-store';
import { CURRENCIES, type CurrencyCode } from '../../core/money/types';

interface Props {
  onOpenGroup: (id: string) => void;
}

export function GroupsList({ onOpenGroup }: Props) {
  const groups = useGroups((s) => s.groups);
  const createGroup = useGroups((s) => s.createGroup);
  const identity = useSession((s) => s.identity);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [partner, setPartner] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('INR');
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);

  const visible = groups.filter((g) => (showArchived ? g.archivedAt : !g.archivedAt));

  return (
    <div className="pb-24">
      <Header
        title="Groups"
        right={
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            + New
          </Button>
        }
      />
      <div className="mx-auto max-w-md px-4 py-3">
        <div className="mb-3 flex gap-2 text-xs">
          <button
            className={`rounded-full px-3 py-1 ${!showArchived ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
            onClick={() => setShowArchived(false)}
          >
            Active
          </button>
          <button
            className={`rounded-full px-3 py-1 ${showArchived ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
            onClick={() => setShowArchived(true)}
          >
            Archived
          </button>
        </div>
        {visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            {showArchived
              ? 'No archived groups.'
              : 'No groups yet. Tap “+ New” to create your first one.'}
          </div>
        ) : (
          <ul className="space-y-2">
            {visible.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => onOpenGroup(g.id)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-sky-300"
                  data-testid="group-row"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-base font-semibold text-slate-900">{g.name}</span>
                    <span className="text-xs text-slate-500">{g.currency}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New group">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim() || !partner.trim() || !identity || busy) return;
            setBusy(true);
            try {
              const id = await createGroup({
                name: name.trim(),
                currency,
                createdByFingerprint: identity.fingerprint,
                firstMembers: [
                  { name: identity.displayName, claimedByFingerprint: identity.fingerprint },
                  { name: partner.trim() },
                ],
              });
              setShowCreate(false);
              setName('');
              setPartner('');
              onOpenGroup(id);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input
            label="Group name"
            placeholder="e.g. Goa Trip, Apartment, Family"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={60}
            required
          />
          <Input
            label="Who do you split with?"
            placeholder="e.g. Priya"
            value={partner}
            onChange={(e) => setPartner(e.target.value)}
            maxLength={40}
            required
          />
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Currency</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setShowCreate(false)} fullWidth>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} fullWidth>
              {busy ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
