import * as Y from 'yjs';
import { getGroupDoc } from '../crdt/group-doc';
import { hydrateGroupCache } from '../storage/hydration';

export type PeerEvent =
  | { type: 'open'; channel: RTCDataChannel }
  | { type: 'close' }
  | { type: 'error'; error: unknown };

export interface PeerSession {
  pc: RTCPeerConnection;
  channel: RTCDataChannel | null;
  groupId: string;
  remoteFp: string | null;
  remoteName: string | null;
  events: EventTarget;
  close: () => void;
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
type Frame = FrameStateVector | FrameUpdate | FrameHeartbeat;

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

export function attachSyncToChannel(channel: RTCDataChannel, groupId: string): () => void {
  const doc = getGroupDoc(groupId).doc;
  let unsubDoc: (() => void) | null = null;

  function send(frame: Frame) {
    if (channel.readyState === 'open') {
      try {
        channel.send(JSON.stringify(frame));
      } catch (err) {
        console.error('[PrivShare] channel.send failed', err);
      }
    }
  }

  channel.addEventListener('open', () => {
    const sv = Y.encodeStateVector(doc);
    send({ kind: 'state-vector', groupId, vectorB64: b64encode(sv) });
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === channel) return;
      send({ kind: 'update', groupId, updateB64: b64encode(update) });
    };
    doc.on('update', onUpdate);
    unsubDoc = () => doc.off('update', onUpdate);
  });

  channel.addEventListener('message', (e) => {
    try {
      const frame = JSON.parse(e.data as string) as Frame;
      if (frame.kind === 'ping') {
        send({ kind: 'pong' });
        return;
      }
      if (frame.kind === 'pong') return;
      if (frame.kind === 'state-vector') {
        const remoteVec = b64decode(frame.vectorB64);
        const diff = Y.encodeStateAsUpdate(doc, remoteVec);
        send({ kind: 'update', groupId, updateB64: b64encode(diff) });
        return;
      }
      if (frame.kind === 'update') {
        const update = b64decode(frame.updateB64);
        Y.applyUpdate(doc, update, channel);
        void hydrateGroupCache(groupId);
      }
    } catch (err) {
      console.error('[PrivShare] sync frame error', err);
    }
  });

  const heartbeat = setInterval(() => {
    if (channel.readyState === 'open') send({ kind: 'ping' });
  }, 15_000);

  channel.addEventListener('close', () => {
    clearInterval(heartbeat);
    unsubDoc?.();
  });

  return () => {
    clearInterval(heartbeat);
    unsubDoc?.();
  };
}
