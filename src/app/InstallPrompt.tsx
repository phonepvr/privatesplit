import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'privshare:install-dismissed-at';

export function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      const dismissed = localStorage.getItem(DISMISS_KEY);
      if (dismissed && Date.now() - Number(dismissed) < 14 * 24 * 3600 * 1000) return;
      setEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!event) return null;
  return (
    <div className="fixed inset-x-3 bottom-20 z-30 mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
      <p className="text-sm font-medium">Install PrivShare for offline use</p>
      <p className="text-xs text-slate-500">
        Adds an icon to your home screen. No data leaves this device.
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, String(Date.now()));
            setEvent(null);
          }}
          className="text-xs text-slate-500"
        >
          Not now
        </button>
        <button
          onClick={async () => {
            await event.prompt();
            const choice = await event.userChoice;
            if (choice.outcome === 'dismissed') {
              localStorage.setItem(DISMISS_KEY, String(Date.now()));
            }
            setEvent(null);
          }}
          className="rounded-md bg-sky-600 px-3 py-1 text-xs font-medium text-white"
        >
          Install
        </button>
      </div>
    </div>
  );
}
