import { useEffect, useState } from 'react';
import { db, type PeerRow } from '../../core/storage/db';
import { Avatar } from '../../ui/components/Avatar';
import { Button } from '../../ui/components/Button';
import {
  closeSession,
  listSessions,
  subscribeSessions,
  type ActivePeerSession,
} from '../../core/sync/peer-session';

interface Props {
  onReconnect: () => void;
}

export function PeersList({ onReconnect }: Props) {
  const [peers, setPeers] = useState<PeerRow[]>([]);
  const [activeSessions, setActiveSessions] = useState<ActivePeerSession[]>(() => listSessions());

  useEffect(() => {
    void db().peers.toArray().then(setPeers);
  }, []);

  useEffect(() => {
    setActiveSessions(listSessions());
    const unsub = subscribeSessions(() => setActiveSessions(listSessions()));
    return unsub;
  }, []);

  const liveByFingerprint = new Map<string, ActivePeerSession>();
  for (const s of activeSessions) {
    if (s.remoteFingerprint) liveByFingerprint.set(s.remoteFingerprint, s);
  }

  if (peers.length === 0 && activeSessions.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        No paired devices yet. Pair once on the same WiFi to enable later sync.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {peers.map((p) => {
        const live = liveByFingerprint.get(p.fingerprint);
        return (
          <li
            key={p.fingerprint}
            className="flex items-center gap-3 rounded-lg border border-slate-200 p-3"
          >
            <Avatar name={p.displayName} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium">{p.displayName}</p>
              <p className="text-xs text-slate-500">
                {live ? (
                  <span className="text-emerald-700">Connected now</span>
                ) : (
                  <>Last seen {p.lastSeenAt ? humanWhen(p.lastSeenAt) : 'never'}</>
                )}{' '}
                · fp {p.fingerprint}
              </p>
            </div>
            {live ? (
              <Button
                variant="ghost"
                onClick={() => {
                  closeSession(live.groupId);
                }}
              >
                Disconnect
              </Button>
            ) : (
              <Button variant="secondary" onClick={onReconnect}>
                Reconnect
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function humanWhen(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 24 * 3_600_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / (24 * 3_600_000))}d ago`;
}
