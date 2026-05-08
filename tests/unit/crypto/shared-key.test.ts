import { describe, expect, it } from 'vitest';
import {
  deriveSharedKeyB64,
  newPairingId,
  openWithSharedKey,
  sealWithSharedKey,
} from '../../../src/core/crypto/shared-key';

describe('shared-key derivation', () => {
  it('produces the same key for the same pairingId', async () => {
    const pid = newPairingId();
    const a = await deriveSharedKeyB64(pid);
    const b = await deriveSharedKeyB64(pid);
    expect(a).toBe(b);
  });

  it('produces different keys for different pairingIds', async () => {
    const a = await deriveSharedKeyB64(newPairingId());
    const b = await deriveSharedKeyB64(newPairingId());
    expect(a).not.toBe(b);
  });

  it('seal + open round-trip', async () => {
    const pid = newPairingId();
    const key = await deriveSharedKeyB64(pid);
    const blob = await sealWithSharedKey(key, 'hello sdp world');
    const back = await openWithSharedKey(key, blob);
    expect(back).toBe('hello sdp world');
  });

  it('open with the wrong key throws', async () => {
    const blob = await sealWithSharedKey(await deriveSharedKeyB64(newPairingId()), 'x');
    const wrong = await deriveSharedKeyB64(newPairingId());
    await expect(openWithSharedKey(wrong, blob)).rejects.toThrow();
  });
});
