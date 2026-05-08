// Streamlined reconnect using stored peer credentials.
//
// Goal: when both phones are online and the user taps "Reconnect with Priya"
// (or `online` event auto-fires), establish a fresh data channel without
// asking the user to choose host/joiner, choose a group, or paste codes.
//
// Two modes:
//   relay  — uses an opt-in WebSocket signaling relay that sees only
//            encrypted SDP blobs keyed by the stored pairingId. Both sides
//            try this concurrently; whichever side's offer arrives first
//            "wins" and the other answers. Fully automatic.
//   paste  — falls back to a 1-paste-each-side flow. The caller renders
//            the offer code and accepts a textarea answer.

import { db, type PeerRow } from '../storage/db';
import { getGroupDoc } from '../crdt/group-doc';
import { getSession, registerSession } from './peer-session';
import { gatherIceComplete, newPeerConnection } from './transport';
import { loadConfig, openSignalingChannel, type RelayMessage } from './signaling';
import type { LoadedIdentity } from '../storage/identity';

export interface ReconnectAttempt {
  groupId: string;
  peer: PeerRow;
  abort: () => void;
  /** Resolved when the channel opens. Rejected on timeout / error. */
  done: Promise<void>;
}

export async function reconnectWithPeer(
  identity: LoadedIdentity,
  peer: PeerRow,
  groupId: string,
  opts: { timeoutMs?: number } = {}
): Promise<ReconnectAttempt> {
  // No-op if a session is already alive for this group.
  const existing = getSession(groupId);
  if (existing && existing.channel.readyState === 'open') {
    return {
      groupId,
      peer,
      abort: () => {
        /* already connected; nothing to abort */
      },
      done: Promise.resolve(),
    };
  }

  if (!peer.pairingId || !peer.sharedKeyB64) {
    throw new Error(
      'This peer was paired before automatic reconnect was supported. Use the Pair screen once to refresh credentials.'
    );
  }

  const cfg = loadConfig();
  if (!cfg.enabled) {
    throw new Error('relay-disabled');
  }

  const timeoutMs = opts.timeoutMs ?? 20_000;

  const pc = newPeerConnection();
  const channel = pc.createDataChannel('privshare', { ordered: true });
  // Make the joiner side accept whatever offer the other peer sends. We use
  // a deterministic role assignment based on fingerprint so both sides agree:
  // the lexicographically smaller fingerprint becomes the host (creates the
  // offer); the other becomes the joiner. Without this, both would race.
  const role: 'host' | 'joiner' = identity.fingerprint < peer.fingerprint ? 'host' : 'joiner';

  const sig = openSignalingChannel({
    url: cfg.url,
    pairingId: peer.pairingId,
    sharedKeyB64: peer.sharedKeyB64,
  });

  let done!: () => void;
  let fail!: (err: Error) => void;
  const donePromise = new Promise<void>((res, rej) => {
    done = res;
    fail = rej;
  });

  const timer = setTimeout(() => {
    fail(new Error('Reconnect timed out — the other device may be offline.'));
    cleanup();
  }, timeoutMs);

  function cleanup() {
    clearTimeout(timer);
    sig.close();
  }

  channel.addEventListener('open', () => {
    cleanup();
    done();
  });

  // Peer connection wiring depending on role.
  if (role === 'host') {
    // Wait until we've sent our offer.
    (async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await gatherIceComplete(pc, 3000);
        await sig.send({
          kind: 'sdp-offer',
          fromFp: identity.fingerprint,
          payload: pc.localDescription?.sdp ?? offer.sdp ?? '',
        });
      } catch (err) {
        fail(err as Error);
        cleanup();
      }
    })();
    sig.onMessage((msg: RelayMessage) => {
      if (msg.kind !== 'sdp-answer' || msg.fromFp === identity.fingerprint) return;
      pc.setRemoteDescription({ type: 'answer', sdp: msg.payload }).catch((err: Error) => {
        fail(err);
        cleanup();
      });
    });
  } else {
    pc.addEventListener('datachannel', (e) => {
      // Replace the local channel ref with the actually-open channel.
      const liveChannel = e.channel;
      registerSession({
        groupId,
        pc,
        channel: liveChannel,
        role: 'joiner',
        remoteFingerprint: peer.fingerprint,
        remoteDisplayName: peer.displayName,
      });
      liveChannel.addEventListener('open', () => {
        cleanup();
        done();
      });
    });
    sig.onMessage(async (msg: RelayMessage) => {
      if (msg.kind !== 'sdp-offer' || msg.fromFp === identity.fingerprint) return;
      try {
        await pc.setRemoteDescription({ type: 'offer', sdp: msg.payload });
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        await gatherIceComplete(pc, 3000);
        await sig.send({
          kind: 'sdp-answer',
          fromFp: identity.fingerprint,
          payload: pc.localDescription?.sdp ?? ans.sdp ?? '',
        });
      } catch (err) {
        fail(err as Error);
        cleanup();
      }
    });
  }

  if (role === 'host') {
    // Register the host's session up-front; channel.open fires when ICE
    // completes with the remote.
    registerSession({
      groupId,
      pc,
      channel,
      role: 'host',
      remoteFingerprint: peer.fingerprint,
      remoteDisplayName: peer.displayName,
    });
  }

  // Defensive: persist last-seen and last-connected on success.
  donePromise
    .then(async () => {
      await db().peers.update(peer.fingerprint, {
        lastConnectedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      });
    })
    .catch(() => {
      /* swallow */
    });

  // Touch group doc so its observer fires on the resulting CRDT update.
  void getGroupDoc(groupId);

  return {
    groupId,
    peer,
    abort: () => {
      cleanup();
      try {
        pc.close();
      } catch {
        /* ignore */
      }
      fail(new Error('aborted'));
    },
    done: donePromise,
  };
}

/**
 * Find peers that look reconnectable for the given group. A peer is
 * reconnectable if it has a pairingId + sharedKey (set on first pair) AND
 * the group is in its sharedGroupIds list.
 */
export async function listReconnectablePeers(groupId: string): Promise<PeerRow[]> {
  const all = await db().peers.toArray();
  return all.filter((p) => p.pairingId && p.sharedKeyB64 && p.sharedGroupIds.includes(groupId));
}

/** Return any peer with stored pairing credentials, regardless of group. */
export async function listAllReconnectablePeers(): Promise<PeerRow[]> {
  const all = await db().peers.toArray();
  return all.filter((p) => p.pairingId && p.sharedKeyB64);
}
