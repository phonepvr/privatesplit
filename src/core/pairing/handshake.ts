import { db } from '../storage/db';
import { type LoadedIdentity } from '../storage/identity';
import { exportPublicKey } from '../crypto/keys';
import { bytesToBase64 } from '../crypto/keys';
import { gatherIceComplete, newPeerConnection } from '../sync/transport';
import { decodeEnvelope, encodeEnvelope, type AnswerEnvelope, type OfferEnvelope } from './codec';

export interface OfferSession {
  pc: RTCPeerConnection;
  channel: RTCDataChannel;
  encodedOffer: string;
  envelope: OfferEnvelope;
  acceptAnswer: (encodedAnswer: string) => Promise<AnswerEnvelope>;
}

export async function createOfferSession(args: {
  identity: LoadedIdentity;
  groupId: string;
  groupName: string;
  currency: string;
  groupKeyB64: string;
  memberIdToClaim?: string;
}): Promise<OfferSession> {
  const pc = newPeerConnection();
  const channel = pc.createDataChannel('privshare', { ordered: true });
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await gatherIceComplete(pc, 3000);
  const localSdp = pc.localDescription?.sdp ?? offer.sdp ?? '';
  const envelope: OfferEnvelope = {
    v: 1,
    kind: 'offer',
    sdp: localSdp,
    deviceFp: args.identity.fingerprint,
    displayName: args.identity.displayName,
    groupInvite: {
      groupId: args.groupId,
      groupName: args.groupName,
      currency: args.currency,
      groupKeyB64: args.groupKeyB64,
    },
  };
  if (args.memberIdToClaim && envelope.groupInvite) {
    envelope.groupInvite.memberIdToClaim = args.memberIdToClaim;
  }
  const encodedOffer = encodeEnvelope(envelope);
  return {
    pc,
    channel,
    encodedOffer,
    envelope,
    async acceptAnswer(encoded) {
      const ans = decodeEnvelope(encoded.trim()) as AnswerEnvelope;
      if (ans.kind !== 'answer') throw new Error('Expected an answer envelope');
      await pc.setRemoteDescription({ type: 'answer', sdp: ans.sdp });
      await persistPeer(args.identity, ans, [args.groupId]);
      return ans;
    },
  };
}

export interface AnswerSession {
  pc: RTCPeerConnection;
  channelPromise: Promise<RTCDataChannel>;
  encodedAnswer: string;
  receivedOffer: OfferEnvelope;
}

export async function createAnswerSession(args: {
  identity: LoadedIdentity;
  encodedOffer: string;
}): Promise<AnswerSession> {
  const offer = decodeEnvelope(args.encodedOffer.trim()) as OfferEnvelope;
  if (offer.kind !== 'offer') throw new Error('Expected an offer envelope');
  const pc = newPeerConnection();
  let resolveChannel!: (c: RTCDataChannel) => void;
  const channelPromise = new Promise<RTCDataChannel>((resolve) => (resolveChannel = resolve));
  pc.addEventListener('datachannel', (e) => resolveChannel(e.channel));

  await pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
  const ans = await pc.createAnswer();
  await pc.setLocalDescription(ans);
  await gatherIceComplete(pc, 3000);

  const envelope: AnswerEnvelope = {
    v: 1,
    kind: 'answer',
    sdp: pc.localDescription?.sdp ?? ans.sdp ?? '',
    deviceFp: args.identity.fingerprint,
    displayName: args.identity.displayName,
  };
  const encodedAnswer = encodeEnvelope(envelope);
  await persistPeer(args.identity, offer, offer.groupInvite ? [offer.groupInvite.groupId] : []);
  return {
    pc,
    channelPromise,
    encodedAnswer,
    receivedOffer: offer,
  };
}

async function persistPeer(
  identity: LoadedIdentity,
  remote: { deviceFp: string; displayName: string },
  sharedGroupIds: string[]
): Promise<void> {
  const rawPub = await exportPublicKey(identity.publicKey);
  // We don't have remote public key in v1 envelopes; we record what we know now.
  const existing = await db().peers.get(remote.deviceFp);
  await db().peers.put({
    fingerprint: remote.deviceFp,
    displayName: remote.displayName,
    publicKeyRawB64: existing?.publicKeyRawB64 ?? bytesToBase64(rawPub),
    trustedAt: existing?.trustedAt ?? new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    sharedGroupIds: Array.from(new Set([...(existing?.sharedGroupIds ?? []), ...sharedGroupIds])),
  });
}
