import * as Y from 'yjs';
import { attachSyncToChannel } from './transport';
import { getGroupDoc } from '../crdt/group-doc';
import { useGroups } from '../../stores/groups-store';

export interface ActivePeerSession {
  groupId: string;
  pc: RTCPeerConnection;
  channel: RTCDataChannel;
  role: 'host' | 'joiner';
  remoteFingerprint: string | null;
  remoteDisplayName: string | null;
  startedAt: number;
  detach: () => void;
}

const sessions = new Map<string, ActivePeerSession>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch (err) {
      console.error('[PrivShare] peer-session listener failed', err);
    }
  }
}

export function subscribeSessions(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export interface RegisterArgs {
  groupId: string;
  pc: RTCPeerConnection;
  channel: RTCDataChannel;
  role: 'host' | 'joiner';
  remoteFingerprint?: string | null;
  remoteDisplayName?: string | null;
}

export function registerSession(args: RegisterArgs): ActivePeerSession {
  // Replace any existing session for this group.
  const existing = sessions.get(args.groupId);
  if (existing) {
    try {
      existing.detach();
      existing.pc.close();
    } catch {
      /* ignore */
    }
    sessions.delete(args.groupId);
  }
  const detach = attachSyncToChannel(args.channel, args.groupId, args.role);
  const session: ActivePeerSession = {
    groupId: args.groupId,
    pc: args.pc,
    channel: args.channel,
    role: args.role,
    remoteFingerprint: args.remoteFingerprint ?? null,
    remoteDisplayName: args.remoteDisplayName ?? null,
    startedAt: Date.now(),
    detach,
  };
  sessions.set(args.groupId, session);

  // Auto-clean when the channel actually closes.
  args.channel.addEventListener('close', () => {
    if (sessions.get(args.groupId) === session) {
      sessions.delete(args.groupId);
      notify();
    }
  });
  notify();
  return session;
}

export function getSession(groupId: string): ActivePeerSession | undefined {
  return sessions.get(groupId);
}

export function listSessions(): ActivePeerSession[] {
  return [...sessions.values()];
}

export function closeSession(groupId: string): void {
  const session = sessions.get(groupId);
  if (!session) return;
  try {
    session.detach();
  } catch {
    /* ignore */
  }
  try {
    session.channel.close();
  } catch {
    /* ignore */
  }
  try {
    session.pc.close();
  } catch {
    /* ignore */
  }
  sessions.delete(groupId);
  useGroups.getState().setSyncStatus(groupId, 'closed');
  notify();
}

/**
 * Re-send our state vector to nudge the remote into pushing any updates we
 * haven't seen yet. Idempotent and cheap. Returns true if a session existed.
 */
export function nudge(groupId: string): boolean {
  const session = sessions.get(groupId);
  if (!session) return false;
  if (session.channel.readyState !== 'open') return false;
  const doc = getGroupDoc(groupId).doc;
  const sv = Y.encodeStateVector(doc);
  let bin = '';
  for (const b of sv) bin += String.fromCharCode(b);
  try {
    session.channel.send(JSON.stringify({ kind: 'state-vector', groupId, vectorB64: btoa(bin) }));
    useGroups.getState().setSyncStatus(groupId, 'exchanging');
    return true;
  } catch (err) {
    console.error('[PrivShare] nudge failed', err);
    return false;
  }
}
