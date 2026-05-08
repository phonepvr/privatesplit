import { describe, expect, it } from 'vitest';
import { decryptJson, encryptJson, isEncryptedEnvelope } from '../../../src/core/crypto/passphrase';

// happy-dom provides crypto.subtle but is slow on PBKDF2 with 100k iterations,
// so these tests are tolerant of the time it takes (vitest default timeout is fine).
describe('passphrase encryption', () => {
  it('round-trips a JSON payload', async () => {
    const env = await encryptJson({ hello: 'world', n: 42 }, 'correct horse battery', 'unit-test');
    const back = await decryptJson<{ hello: string; n: number }>(env, 'correct horse battery');
    expect(back).toEqual({ hello: 'world', n: 42 });
  });

  it('rejects the wrong passphrase', async () => {
    const env = await encryptJson({ secret: true }, 'right passphrase', 'unit-test');
    await expect(decryptJson(env, 'wrong passphrase')).rejects.toThrow(/wrong passphrase/i);
  });

  it('refuses very short passphrases on encrypt', async () => {
    await expect(encryptJson({ x: 1 }, 'short', 'unit-test')).rejects.toThrow(/at least 8/);
  });

  it('isEncryptedEnvelope recognises produced envelopes', async () => {
    const env = await encryptJson({ x: 1 }, 'long enough', 'unit-test');
    expect(isEncryptedEnvelope(env)).toBe(true);
    expect(isEncryptedEnvelope({ format: 'something-else' })).toBe(false);
    expect(isEncryptedEnvelope(null)).toBe(false);
  });
});
