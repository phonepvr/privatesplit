import { useRef, useState } from 'react';
import { Header } from '../../app/shell/Header';
import { Button } from '../../ui/components/Button';
import { Input } from '../../ui/components/Input';
import { useSession } from '../../stores/session-store';
import { useGroups } from '../../stores/groups-store';
import { db } from '../../core/storage/db';
import { clearIdentityCache } from '../../core/storage/identity';
import { importPrivShareFile } from '../export-import/privshare';
import { exportDeviceAsBlob, importDeviceBackupFile } from '../export-import/device-backup';
import { PeersList } from '../pairing/PeersList';
import { PassphraseModal } from '../../ui/components/PassphraseModal';
import { PrivacySummary } from './PrivacySummary';

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
  const deviceFileInput = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportPassphraseOpen, setExportPassphraseOpen] = useState(false);
  const [importPassphrase, setImportPassphrase] = useState<{
    target: 'group' | 'device';
    text: string;
  } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    setImportPassphrase({ target: 'group', text });
    if (fileInput.current) fileInput.current.value = '';
  }

  async function applyGroupImport(passphrase: string) {
    if (!importPassphrase) return;
    setImportMsg('Importing…');
    const result = await importPrivShareFile(importPassphrase.text, { mode: 'new', passphrase });
    if (result.ok) {
      const note = result.signatureValid
        ? 'signature valid'
        : 'signature unknown — proceed with caution';
      setImportMsg(`Imported "${result.groupName}" (${note}).`);
      setImportPassphrase(null);
    } else {
      throw new Error(result.reason ?? 'unknown');
    }
  }

  async function saveDeviceBackup(passphrase: string) {
    if (!identity || busy) return;
    setBusy(true);
    setImportMsg('Encrypting backup…');
    try {
      const blob = await exportDeviceAsBlob(identity, passphrase);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `privshare-${identity.displayName.replace(/\s+/g, '-')}-${stamp}.privshare-device`;
      a.click();
      URL.revokeObjectURL(url);
      localStorage.setItem('privshare:lastBackupAt', String(Date.now()));
      setImportMsg(`Saved encrypted backup of ${groups.length} group(s).`);
      setExportPassphraseOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function onDeviceFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    setImportPassphrase({ target: 'device', text });
    if (deviceFileInput.current) deviceFileInput.current.value = '';
  }

  async function applyDeviceImport(passphrase: string) {
    if (!importPassphrase) return;
    setImportMsg('Restoring device backup…');
    const result = await importDeviceBackupFile(importPassphrase.text, passphrase);
    if (result.ok) {
      setImportMsg(
        `Restored ${result.importedGroupCount} group(s) from ${result.exportedByDisplayName ?? 'backup'}.`
      );
      setImportPassphrase(null);
    } else {
      throw new Error(result.reason ?? 'unknown');
    }
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
            Backups are encrypted on this device with a passphrase you choose. You&apos;ll need the
            same passphrase to restore. Without it, the file is unreadable — even to us.
          </p>
          <input
            ref={deviceFileInput}
            type="file"
            accept=".privshare-device,application/json"
            hidden
            onChange={onDeviceFile}
          />
          <input
            ref={fileInput}
            type="file"
            accept=".privshare,application/json"
            hidden
            onChange={onFile}
          />
          <div className="mt-3 grid gap-2">
            <Button
              onClick={() => setExportPassphraseOpen(true)}
              disabled={busy || !identity}
              fullWidth
            >
              {busy ? 'Saving…' : 'Save device backup'}
            </Button>
            <Button variant="secondary" onClick={() => deviceFileInput.current?.click()} fullWidth>
              Restore from device backup
            </Button>
            <Button variant="ghost" onClick={() => fileInput.current?.click()} fullWidth>
              Import a single group (.privshare)
            </Button>
          </div>
          {importMsg && <p className="mt-2 text-xs text-slate-600">{importMsg}</p>}
          <p className="mt-2 text-xs text-slate-400">Local groups: {groups.length}</p>
        </section>

        <PassphraseModal
          open={exportPassphraseOpen}
          mode="export"
          title="Encrypt your backup"
          description="Pick a strong passphrase. You will need it to restore."
          onConfirm={(p) => saveDeviceBackup(p)}
          onClose={() => setExportPassphraseOpen(false)}
        />
        <PassphraseModal
          open={importPassphrase !== null}
          mode="import"
          title="Decrypt the backup"
          description="Enter the passphrase used when this file was exported."
          onConfirm={async (p) => {
            if (importPassphrase?.target === 'device') await applyDeviceImport(p);
            else await applyGroupImport(p);
          }}
          onClose={() => setImportPassphrase(null)}
        />

        <PrivacySummary />

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
