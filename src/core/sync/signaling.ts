// Tiny WebSocket-based signaling client for trustless reconnect.
//
// Privacy properties:
// - The relay sees only `topic` (a 32-byte random pairingId) and base64
//   ciphertext blobs encrypted with the AES-GCM `sharedKey` derived from
//   that pairingId. It cannot read SDP, identity, or expense data.
// - The relay never sees per-message routing because pubsub is per-topic.
// - The relay is opt-in (default ON after first pair) and the URL is
//   user-configurable via Profile → Sync settings.
//
// Wire format mirrors y-webrtc's signaling protocol so existing free
// relays (e.g. wss://signaling.yjs.dev) work without us hosting anything.
// We only use {subscribe, publish}; we don't piggy-back on awareness.

import { openWithSharedKey, sealWithSharedKey, type SealedBlob } from '../crypto/shared-key';

export const DEFAULT_RELAY_URL = 'wss://signaling.yjs.dev';

export interface SignalingConfig {
  enabled: boolean;
  url: string;
}

const STORAGE_KEY = 'privshare:signaling-config';

export function loadConfig(): SignalingConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SignalingConfig>;
      return {
        enabled: parsed.enabled !== false, // default ON
        url: parsed.url || DEFAULT_RELAY_URL,
      };
    }
  } catch {
    /* fall through */
  }
  return { enabled: true, url: DEFAULT_RELAY_URL };
}

export function saveConfig(cfg: SignalingConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export interface RelayMessage {
  kind: 'sdp-offer' | 'sdp-answer';
  fromFp: string;
  payload: string; // sender's encrypted SDP
}

export interface SignalingChannel {
  /** Send a message to all peers subscribed to this pairingId. */
  send: (msg: RelayMessage) => Promise<void>;
  /** Receive a message from another peer. The handler receives messages
   *  authored by anyone except us. */
  onMessage: (fn: (msg: RelayMessage) => void) => void;
  close: () => void;
  ready: Promise<void>;
}

interface OpenArgs {
  url: string;
  pairingId: string;
  sharedKeyB64: string;
}

export function openSignalingChannel(args: OpenArgs): SignalingChannel {
  const ws = new WebSocket(args.url);
  let listener: ((msg: RelayMessage) => void) | null = null;

  const ready = new Promise<void>((resolve, reject) => {
    let opened = false;
    ws.addEventListener('open', () => {
      opened = true;
      ws.send(
        JSON.stringify({
          type: 'subscribe',
          topics: [args.pairingId],
        })
      );
      resolve();
    });
    ws.addEventListener('error', (ev) => {
      if (!opened) reject(new Error('signaling websocket error'));
      else console.error('[PrivShare] signaling error', ev);
    });
  });

  ws.addEventListener('message', async (ev) => {
    try {
      const data: unknown = JSON.parse(ev.data as string);
      // y-webrtc relay forwards as { type:'publish', topic, data }
      if (
        typeof data === 'object' &&
        data !== null &&
        (data as { type?: string }).type === 'publish' &&
        typeof (data as { data?: unknown }).data === 'object'
      ) {
        const inner = (data as { data: { sealed?: SealedBlob; kind?: string; fromFp?: string } })
          .data;
        if (inner.sealed && inner.kind && inner.fromFp) {
          try {
            const plain = await openWithSharedKey(args.sharedKeyB64, inner.sealed);
            const decoded = JSON.parse(plain) as RelayMessage;
            listener?.(decoded);
          } catch (err) {
            console.warn('[PrivShare] signaling: drop unreadable frame', err);
          }
        }
      }
    } catch (err) {
      console.warn('[PrivShare] signaling: parse error', err);
    }
  });

  const send = async (msg: RelayMessage) => {
    await ready;
    const sealed = await sealWithSharedKey(args.sharedKeyB64, JSON.stringify(msg));
    ws.send(
      JSON.stringify({
        type: 'publish',
        topic: args.pairingId,
        data: { sealed, kind: msg.kind, fromFp: msg.fromFp },
      })
    );
  };

  return {
    ready,
    send,
    onMessage: (fn) => {
      listener = fn;
    },
    close: () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    },
  };
}
