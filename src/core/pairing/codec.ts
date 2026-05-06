import pako from 'pako';
import { base64ToBytes, bytesToBase64 } from '../crypto/keys';

export interface OfferEnvelope {
  v: 1;
  kind: 'offer';
  sdp: string;
  deviceFp: string;
  displayName: string;
  groupInvite?: {
    groupId: string;
    groupName: string;
    currency: string;
    groupKeyB64: string;
    memberIdToClaim?: string;
  };
}

export interface AnswerEnvelope {
  v: 1;
  kind: 'answer';
  sdp: string;
  deviceFp: string;
  displayName: string;
  claimedMemberId?: string;
}

export type Envelope = OfferEnvelope | AnswerEnvelope;

export function encodeEnvelope(env: Envelope): string {
  const json = JSON.stringify(env);
  const compressed = pako.deflate(new TextEncoder().encode(json));
  return bytesToBase64(compressed);
}

export function decodeEnvelope(encoded: string): Envelope {
  const compressed = base64ToBytes(encoded.trim());
  const json = pako.inflate(compressed, { to: 'string' });
  return JSON.parse(json) as Envelope;
}

export interface QrFrame {
  s: number;
  t: number;
  p: string;
}

export function chunkForQr(encoded: string, chunkSize = 320): QrFrame[] {
  const frames: QrFrame[] = [];
  const total = Math.ceil(encoded.length / chunkSize);
  for (let i = 0; i < total; i += 1) {
    frames.push({ s: i, t: total, p: encoded.slice(i * chunkSize, (i + 1) * chunkSize) });
  }
  return frames;
}

export function reassembleFrames(frames: QrFrame[]): string | null {
  if (frames.length === 0) return null;
  const total = frames[0]!.t;
  const have = new Map<number, string>();
  for (const f of frames) have.set(f.s, f.p);
  if (have.size < total) return null;
  let out = '';
  for (let i = 0; i < total; i += 1) {
    const p = have.get(i);
    if (p === undefined) return null;
    out += p;
  }
  return out;
}
