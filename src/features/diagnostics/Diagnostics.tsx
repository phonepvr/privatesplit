import { useEffect, useState } from 'react';
import { Header } from '../../app/shell/Header';
import { Button } from '../../ui/components/Button';
import { clearLogs, fetchLogs } from '../../core/diagnostics/log';

interface Props {
  onBack: () => void;
}

export function Diagnostics({ onBack }: Props) {
  const [logs, setLogs] = useState<Awaited<ReturnType<typeof fetchLogs>>>([]);
  const [storage, setStorage] = useState<{ usage?: number; quota?: number }>({});
  useEffect(() => {
    void fetchLogs().then(setLogs);
    void navigator.storage
      ?.estimate?.()
      .then((est) => setStorage({ usage: est.usage ?? 0, quota: est.quota ?? 0 }));
  }, []);
  return (
    <div className="pb-24">
      <Header title="Diagnostics" back={onBack} />
      <div className="mx-auto max-w-md space-y-3 px-4 py-3 text-xs">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="font-semibold">Storage</p>
          <p className="text-slate-500">
            {storage.usage !== undefined ? formatBytes(storage.usage) : '?'} used /{' '}
            {storage.quota !== undefined ? formatBytes(storage.quota) : '?'} quota
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              const text = logs
                .map((l) => `${l.ts} ${l.level.toUpperCase()} ${l.source} :: ${l.message}`)
                .join('\n');
              const blob = new Blob([text], { type: 'text/plain' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'privshare-diagnostics.txt';
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            Export logs
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await clearLogs();
              setLogs([]);
            }}
          >
            Clear
          </Button>
        </div>
        <div className="space-y-1">
          {logs.length === 0 ? (
            <p className="text-slate-500">No log entries yet.</p>
          ) : (
            logs.map((l) => (
              <div
                key={l.id}
                className={`rounded-md p-2 ${
                  l.level === 'error'
                    ? 'bg-rose-50 text-rose-800'
                    : l.level === 'warn'
                      ? 'bg-amber-50 text-amber-800'
                      : 'bg-slate-50 text-slate-700'
                }`}
              >
                <p className="font-mono text-[10px] text-slate-500">
                  {l.ts} {l.source}
                </p>
                <p>{l.message}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
