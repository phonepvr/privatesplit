import { describe, expect, it } from 'vitest';
import {
  chunkForQr,
  decodeEnvelope,
  encodeEnvelope,
  reassembleFrames,
  type OfferEnvelope,
} from '../../../src/core/pairing/codec';

describe('pairing codec', () => {
  it('round-trips an offer envelope', () => {
    const env: OfferEnvelope = {
      v: 1,
      kind: 'offer',
      sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\n',
      deviceFp: 'ABCDEFGHJKM0',
      displayName: 'Alex',
      groupInvite: {
        groupId: 'g1',
        groupName: 'Goa Trip',
        currency: 'INR',
        groupKeyB64: 'AAAA',
      },
    };
    const encoded = encodeEnvelope(env);
    const decoded = decodeEnvelope(encoded);
    expect(decoded).toEqual(env);
  });

  it('chunks and reassembles a payload', () => {
    const payload = 'x'.repeat(1500);
    const frames = chunkForQr(payload, 200);
    expect(frames.length).toBe(Math.ceil(1500 / 200));
    const out = reassembleFrames(frames);
    expect(out).toBe(payload);
  });

  it('reassembles out-of-order frames', () => {
    const payload = 'abcdefghij';
    const frames = chunkForQr(payload, 3);
    const shuffled = [frames[2], frames[0], frames[3], frames[1]].filter(Boolean) as typeof frames;
    expect(reassembleFrames(shuffled)).toBe(payload);
  });

  it('returns null for incomplete frames', () => {
    const frames = chunkForQr('abcdefghij', 3);
    expect(reassembleFrames(frames.slice(0, 1))).toBeNull();
  });
});
