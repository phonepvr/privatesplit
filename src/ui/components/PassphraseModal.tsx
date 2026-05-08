import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Input } from './Input';
import { Button } from './Button';

interface Props {
  open: boolean;
  mode: 'export' | 'import';
  title?: string;
  description?: string;
  onConfirm: (passphrase: string) => void | Promise<void>;
  onClose: () => void;
}

export function PassphraseModal({ open, mode, title, description, onConfirm, onClose }: Props) {
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setPassphrase('');
      setConfirmation('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (passphrase.length < 8) {
      setError('Passphrase must be at least 8 characters.');
      return;
    }
    if (mode === 'export' && passphrase !== confirmation) {
      setError('Passphrases do not match.');
      return;
    }
    setBusy(true);
    try {
      await onConfirm(passphrase);
    } catch (err) {
      setError(String((err as Error).message ?? err));
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title ?? (mode === 'export' ? 'Choose a passphrase' : 'Enter passphrase')}
    >
      <form className="space-y-3" onSubmit={handleSubmit}>
        {description && <p className="text-xs text-slate-600">{description}</p>}
        <Input
          label="Passphrase"
          type="password"
          autoFocus
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          minLength={8}
          required
        />
        {mode === 'export' && (
          <Input
            label="Confirm passphrase"
            type="password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            minLength={8}
            required
          />
        )}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {mode === 'export' && (
          <p className="text-[11px] text-slate-500">
            We don&apos;t store this. If you lose it, the file becomes unrecoverable.
          </p>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose} fullWidth>
            Cancel
          </Button>
          <Button type="submit" disabled={busy} fullWidth>
            {busy ? 'Working…' : mode === 'export' ? 'Encrypt and save' : 'Decrypt'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
