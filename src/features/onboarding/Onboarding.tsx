import { useState } from 'react';
import { Button } from '../../ui/components/Button';
import { Input } from '../../ui/components/Input';
import { useSession } from '../../stores/session-store';

export function Onboarding() {
  const onboard = useSession((s) => s.onboard);
  const [step, setStep] = useState<'intro' | 'name'>('intro');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

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
            When you and your partner are on the same WiFi, the two phones can sync directly via a
            QR-code pairing — without any third party in the middle.
          </p>
          <p>
            Until then, this device is your ledger. You can export a backup file at any time from
            Settings.
          </p>
          <Button fullWidth onClick={() => setStep('name')}>
            Continue
          </Button>
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
          <p className="text-xs text-slate-500">
            This name is stored only on this device. You can change it later.
          </p>
        </form>
      )}
    </main>
  );
}
