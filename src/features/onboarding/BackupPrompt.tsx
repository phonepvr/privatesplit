import { useEffect, useState } from 'react';
import { useGroups } from '../../stores/groups-store';
import { useSession } from '../../stores/session-store';
import { exportDeviceAsBlob } from '../export-import/device-backup';

const LAST_KEY = 'privshare:lastBackupAt';
const REMIND_KEY = 'privshare:backupReminderAt';
const REMINDER_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

interface Props {
  onOpenProfile: () => void;
}

export function BackupPrompt({ onOpenProfile }: Props) {
  const identity = useSession((s) => s.identity);
  const groupCount = useGroups((s) => s.groups.length);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!identity || groupCount === 0) {
      setVisible(false);
      return;
    }
    const lastBackup = Number(localStorage.getItem(LAST_KEY) ?? 0);
    const lastRemind = Number(localStorage.getItem(REMIND_KEY) ?? 0);
    const now = Date.now();
    const neverBacked = lastBackup === 0;
    const dueAgain = lastBackup > 0 && now - lastBackup > REMINDER_INTERVAL_MS;
    const recentlyDismissed = now - lastRemind < REMINDER_INTERVAL_MS;
    setVisible((neverBacked || dueAgain) && !recentlyDismissed);
  }, [identity, groupCount]);

  if (!visible || !identity) return null;

  return (
    <div className="fixed inset-x-3 bottom-20 z-30 mx-auto max-w-md rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-lg">
      <p className="text-sm font-semibold text-amber-900">Save a backup file?</p>
      <p className="mt-1 text-xs text-amber-800">
        Your data is on this device only. Save a signed backup file you can keep anywhere — you can
        restore it on a new phone or after clearing the app.
      </p>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          onClick={() => {
            localStorage.setItem(REMIND_KEY, String(Date.now()));
            setVisible(false);
          }}
          className="text-xs text-amber-800"
        >
          Remind me later
        </button>
        <button
          onClick={() => {
            setVisible(false);
            onOpenProfile();
          }}
          className="rounded-md bg-amber-200 px-3 py-1 text-xs font-medium text-amber-900"
        >
          Open Backup screen
        </button>
        <button
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            try {
              const blob = await exportDeviceAsBlob(identity);
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              const stamp = new Date().toISOString().slice(0, 10);
              a.download = `privshare-${identity.displayName.replace(/\s+/g, '-')}-${stamp}.privshare-device`;
              a.click();
              URL.revokeObjectURL(url);
              localStorage.setItem(LAST_KEY, String(Date.now()));
              setVisible(false);
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white"
          disabled={busy}
        >
          {busy ? 'Saving…' : 'Save backup now'}
        </button>
      </div>
    </div>
  );
}
