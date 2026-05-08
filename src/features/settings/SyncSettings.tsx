import { useState } from 'react';
import { Button } from '../../ui/components/Button';
import { Input } from '../../ui/components/Input';
import {
  DEFAULT_RELAY_URL,
  loadConfig,
  saveConfig,
  type SignalingConfig,
} from '../../core/sync/signaling';

export function SyncSettings() {
  const [cfg, setCfg] = useState<SignalingConfig>(() => loadConfig());
  const [editingUrl, setEditingUrl] = useState(false);
  const [url, setUrl] = useState(cfg.url);

  function persist(next: SignalingConfig) {
    saveConfig(next);
    setCfg(next);
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold">Sync settings</h3>
      <p className="mt-1 text-xs text-slate-500">
        Reconnect after a WiFi drop uses a small WebSocket signaling relay. The relay sees only a
        random pairing token and AES-encrypted handshake blobs — never your group names, member
        names, or expense data.
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Use signaling relay</p>
          <p className="text-[11px] text-slate-500">
            {cfg.enabled ? 'On — auto-reconnect works' : 'Off — manual reconnect only'}
          </p>
        </div>
        <Button
          variant={cfg.enabled ? 'secondary' : 'primary'}
          onClick={() => persist({ ...cfg, enabled: !cfg.enabled })}
        >
          {cfg.enabled ? 'Disable' : 'Enable'}
        </Button>
      </div>
      <div className="mt-3 text-xs">
        <p className="text-slate-500">Relay URL</p>
        {editingUrl ? (
          <div className="mt-1 flex gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="wss://signaling.yjs.dev"
              className="flex-1"
            />
            <Button
              onClick={() => {
                persist({ ...cfg, url: url.trim() || DEFAULT_RELAY_URL });
                setEditingUrl(false);
              }}
            >
              Save
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setUrl(cfg.url);
                setEditingUrl(false);
              }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="break-all font-mono text-[11px] text-slate-700">{cfg.url}</p>
            <button onClick={() => setEditingUrl(true)} className="text-sky-600">
              Edit
            </button>
          </div>
        )}
        {cfg.url !== DEFAULT_RELAY_URL && (
          <button
            onClick={() => persist({ ...cfg, url: DEFAULT_RELAY_URL })}
            className="mt-1 text-[11px] text-slate-400"
          >
            Reset to default
          </button>
        )}
      </div>
    </section>
  );
}
