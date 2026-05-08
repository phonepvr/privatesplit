import { useRef, useState } from 'react';
import { Button } from '../../ui/components/Button';
import { Input } from '../../ui/components/Input';
import { useSession } from '../../stores/session-store';
import { importDeviceBackupFile } from '../export-import/device-backup';
import { PassphraseModal } from '../../ui/components/PassphraseModal';

type Step = 'intro' | 'choose' | 'name';

export function Onboarding() {
  const onboard = useSession((s) => s.onboard);
  const loadSession = useSession((s) => s.load);
  const [step, setStep] = useState<Step>('intro');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [restoreText, setRestoreText] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleRestoreFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setRestoreError(null);
    const text = await f.text();
    setRestoreText(text);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function applyRestore(passphrase: string) {
    if (!restoreText) return;
    const result = await importDeviceBackupFile(restoreText, passphrase);
    if (!result.ok) {
      throw new Error(result.reason ?? 'Restore failed.');
    }
    if (!result.identityAdopted) {
      throw new Error(
        'Backup did not contain an identity (legacy file). Please choose "Start fresh" and import groups from Profile after onboarding.'
      );
    }
    setRestoreText(null);
    await loadSession();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 pb-12 pt-10">
      <h1 className="text-3xl font-semibold tracking-tight">PrivShare</h1>
      <p className="mt-1 text-sm text-slate-500">Local-first expense splitter for two.</p>

      {step === 'intro' && (
        <section className="mt-8 space-y-4 text-sm leading-relaxed text-slate-700">
          <p>
            <strong>Your data stays on this device.</strong> No accounts, no servers, no internet
            calls after install.
          </p>
          <p>
            When you and your partner are on the same WiFi, the two phones sync directly. Pair once
            and reconnects after that are automatic.
          </p>
          <p>Already used PrivShare? Bring your old data with you.</p>
          <Button fullWidth onClick={() => setStep('choose')}>
            Continue
          </Button>
        </section>
      )}

      {step === 'choose' && (
        <section className="mt-8 space-y-3">
          <input
            ref={fileInput}
            type="file"
            accept=".privshare-device,application/json"
            hidden
            onChange={handleRestoreFile}
          />
          <Button fullWidth onClick={() => fileInput.current?.click()}>
            I have a backup file
          </Button>
          <Button variant="secondary" fullWidth onClick={() => setStep('name')}>
            Start fresh
          </Button>
          {restoreError && (
            <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{restoreError}</p>
          )}
          <p className="text-xs text-slate-500">
            Importing a backup keeps your old fingerprint, paired devices, and all groups so you
            don&apos;t end up with two profiles for one person.
          </p>
        </section>
      )}

      {step === 'name' && (
        <form
          className="mt-8 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim() || busy) return;
            setBusy(true);
            try {
              await onboard(name);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input
            label="Your name"
            placeholder="e.g. Alex"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={40}
            required
          />
          <Button type="submit" fullWidth disabled={!name.trim() || busy}>
            {busy ? 'Setting up…' : 'Get started'}
          </Button>
          <Button type="button" variant="ghost" fullWidth onClick={() => setStep('choose')}>
            Back
          </Button>
          <p className="text-xs text-slate-500">
            This name is stored only on this device. You can change it later.
          </p>
        </form>
      )}

      <PassphraseModal
        open={restoreText !== null}
        mode="import"
        title="Decrypt your backup"
        description="Enter the passphrase you used when you exported this backup."
        onConfirm={async (p) => {
          setRestoreError(null);
          try {
            await applyRestore(p);
          } catch (err) {
            setRestoreError(String((err as Error).message ?? err));
            throw err;
          }
        }}
        onClose={() => {
          setRestoreText(null);
          setRestoreError(null);
        }}
      />
    </main>
  );
}
