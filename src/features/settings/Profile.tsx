import { useRef, useState } from 'react';
import { Header } from '../../app/shell/Header';
import { Button } from '../../ui/components/Button';
import { Input } from '../../ui/components/Input';
import { useSession } from '../../stores/session-store';
import { useGroups } from '../../stores/groups-store';
import { db } from '../../core/storage/db';
import { clearIdentityCache } from '../../core/storage/identity';
import { importPrivShareFile } from '../export-import/privshare';
import { PeersList } from '../pairing/PeersList';

interface Props {
  onOpenPair: () => void;
  onOpenDiagnostics: () => void;
  onOpenTrash: () => void;
}

export function Profile({ onOpenPair, onOpenDiagnostics, onOpenTrash }: Props) {
  const identity = useSession((s) => s.identity);
  const setDisplayName = useSession((s) => s.setDisplayName);
  const groups = useGroups((s) => s.groups);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(identity?.displayName ?? '');
  const fileInput = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImportMsg('Importing…');
    const text = await f.text();
    const result = await importPrivShareFile(text, { mode: 'new' });
    if (result.ok) {
      const note = result.signatureValid
        ? 'signature valid'
        : 'signature unknown — proceed with caution';
      setImportMsg(`Imported "${result.groupName}" (${note}).`);
    } else {
      setImportMsg(`Import failed: ${result.reason ?? 'unknown'}.`);
    }
    if (fileInput.current) fileInput.current.value = '';
  }

  async function factoryReset() {
    const confirm1 = confirm(
      'Factory reset: delete ALL local data including groups, expenses, identity? This cannot be undone.'
    );
    if (!confirm1) return;
    const phrase = prompt('Type RESET to confirm:');
    if (phrase !== 'RESET') return;
    await db().delete();
    clearIdentityCache();
    location.reload();
  }

  return (
    <div className="pb-24">
      <Header title="Profile" />
      <div className="mx-auto max-w-md space-y-4 px-4 py-3">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Your name</p>
          {editing ? (
            <form
              className="mt-2 flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!draftName.trim()) return;
                await setDisplayName(draftName.trim());
                setEditing(false);
              }}
            >
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="flex-1"
              />
              <Button type="submit">Save</Button>
            </form>
          ) : (
            <div className="mt-1 flex items-center justify-between">
              <p className="text-base font-semibold">{identity?.displayName}</p>
              <button
                onClick={() => {
                  setDraftName(identity?.displayName ?? '');
                  setEditing(true);
                }}
                className="text-sm text-sky-600"
              >
                Edit
              </button>
            </div>
          )}
          <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Device fingerprint</p>
          <p className="mt-1 font-mono text-sm">{identity?.fingerprint}</p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold">Sync</h3>
          <p className="mt-1 text-xs text-slate-500">
            Pair with your partner&apos;s phone over WiFi. No internet calls.
          </p>
          <div className="mt-3">
            <Button onClick={onOpenPair}>Pair a device</Button>
          </div>
          <div className="mt-4">
            <PeersList onReconnect={onOpenPair} />
            <p className="mt-2 text-[11px] text-slate-400">
              Reconnect requires both devices to be open. The browser cannot wake a closed PWA.
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold">Backup &amp; restore</h3>
          <p className="mt-1 text-xs text-slate-500">
            Each group can be exported from inside that group. Import a `.privshare` file here.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept=".privshare,application/json"
            hidden
            onChange={onFile}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => fileInput.current?.click()}>
              Import .privshare
            </Button>
          </div>
          {importMsg && <p className="mt-2 text-xs text-slate-600">{importMsg}</p>}
          <p className="mt-2 text-xs text-slate-400">Local groups: {groups.length}</p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold">Other</h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={onOpenTrash}>
              Trash
            </Button>
            <Button variant="secondary" onClick={onOpenDiagnostics}>
              Diagnostics
            </Button>
          </div>
        </section>

        <section className="rounded-xl border border-rose-200 bg-rose-50/40 p-4">
          <h3 className="text-sm font-semibold text-rose-700">Danger zone</h3>
          <div className="mt-3">
            <Button variant="danger" onClick={factoryReset}>
              Factory reset
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
