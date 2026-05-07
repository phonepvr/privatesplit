import * as Y from 'yjs';
import { getGroupDoc } from '../crdt/group-doc';
import { hydrateGroupCache } from '../storage/hydration';
import { useGroups, type SyncStatus } from '../../stores/groups-store';

interface FrameHello {
  kind: 'hello';
  role: 'host' | 'joiner';
  groupId: string;
}
interface FrameStateVector {
  kind: 'state-vector';
  groupId: string;
  vectorB64: string;
}
interface FrameUpdate {
  kind: 'update';
  groupId: string;
  updateB64: string;
}
interface FrameHeartbeat {
  kind: 'ping' | 'pong';
}
type Frame = FrameHello | FrameStateVector | FrameUpdate | FrameHeartbeat;

function b64encode(u: Uint8Array): string {
  let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s);
}
function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) u[i] = bin.charCodeAt(i);
  return u;
}

export async function gatherIceComplete(pc: RTCPeerConnection, timeoutMs = 3000): Promise<void> {
  if (pc.iceGatheringState === 'complete') return;
  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, timeoutMs);
    const check = () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(t);
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', check);
  });
}

export function newPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: [] });
}

function publish(groupId: string, status: SyncStatus): void {
  try {
    useGroups.getState().setSyncStatus(groupId, status);
  } catch {
    /* store may not be ready in tests */
  }
}

export function attachSyncToChannel(
  channel: RTCDataChannel,
  groupId: string,
  role: 'host' | 'joiner'
): () => void {
  const doc = getGroupDoc(groupId).doc;
  let unsubDoc: (() => void) | null = null;
  let receivedRemoteSv = false;
  let receivedFirstUpdate = false;

  publish(groupId, 'opening');

  function send(frame: Frame) {
    if (channel.readyState === 'open') {
      try {
        channel.send(JSON.stringify(frame));
      } catch (err) {
        console.error('[PrivShare] channel.send failed', err);
      }
    }
  }

  function maybeMarkSynced() {
    if (receivedRemoteSv && receivedFirstUpdate) publish(groupId, 'synced');
  }

  // Listen for remote frames synchronously so messages arriving before
  // 'open' fires (rare but possible) are not lost.
  channel.addEventListener('message', (e) => {
    try {
      const frame = JSON.parse(e.data as string) as Frame;
      if (frame.kind === 'ping') {
        send({ kind: 'pong' });
        return;
      }
      if (frame.kind === 'pong') return;
      if (frame.kind === 'hello') {
        // Acknowledge by sending our state vector back.
        publish(groupId, 'exchanging');
        const sv = Y.encodeStateVector(doc);
        send({ kind: 'state-vector', groupId, vectorB64: b64encode(sv) });
        return;
      }
      if (frame.kind === 'state-vector') {
        receivedRemoteSv = true;
        const remoteVec = b64decode(frame.vectorB64);
        const diff = Y.encodeStateAsUpdate(doc, remoteVec);
        send({ kind: 'update', groupId, updateB64: b64encode(diff) });
        publish(groupId, 'exchanging');
        maybeMarkSynced();
        return;
      }
      if (frame.kind === 'update') {
        const update = b64decode(frame.updateB64);
        Y.applyUpdate(doc, update, channel);
        receivedFirstUpdate = true;
        // hydrateGroupCache is fire-and-forget — the store is already
        // driven directly from Yjs observers, so the UI updates
        // synchronously when applyUpdate fires the observer.
        void hydrateGroupCache(groupId);
        maybeMarkSynced();
      }
    } catch (err) {
      console.error('[PrivShare] sync frame error', err);
    }
  });

  channel.addEventListener('open', () => {
    publish(groupId, 'exchanging');
    // Both sides exchange state vectors. We send both a hello AND our SV
    // so the simpler peer (which only handles SV) still works, and so the
    // first message after open is independent of who-opened-first.
    send({ kind: 'hello', role, groupId });
    const sv = Y.encodeStateVector(doc);
    send({ kind: 'state-vector', groupId, vectorB64: b64encode(sv) });

    const onUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === channel) return;
      send({ kind: 'update', groupId, updateB64: b64encode(update) });
    };
    doc.on('update', onUpdate);
    unsubDoc = () => doc.off('update', onUpdate);
  });

  const heartbeat = setInterval(() => {
    if (channel.readyState === 'open') send({ kind: 'ping' });
  }, 15_000);

  channel.addEventListener('close', () => {
    clearInterval(heartbeat);
    unsubDoc?.();
    publish(groupId, 'closed');
  });

  channel.addEventListener('error', () => {
    publish(groupId, 'error');
  });

  return () => {
    clearInterval(heartbeat);
    unsubDoc?.();
  };
}
