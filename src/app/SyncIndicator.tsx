import { useEffect, useState } from 'react';
import { listSessions, subscribeSessions } from '../core/sync/peer-session';

interface Props {
  onClick: () => void;
}

export function SyncIndicator({ onClick }: Props) {
  const [count, setCount] = useState(() => listSessions().length);
  useEffect(() => {
    const unsub = subscribeSessions(() => setCount(listSessions().length));
    return unsub;
  }, []);
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+3.25rem)] z-20 mx-auto flex max-w-md items-center justify-center gap-2 px-4 py-1 text-[11px] font-medium text-emerald-700"
      aria-label="Open sync settings"
    >
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Synced · {count} {count === 1 ? 'connection' : 'connections'}
      </span>
    </button>
  );
}
