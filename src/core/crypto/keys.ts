import { bytesToBase32 } from './base32';

export interface DeviceKeypair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export async function generateDeviceKeypair(): Promise<DeviceKeypair> {
  if (!hasEd25519()) {
    throw new Error('Ed25519 not supported by this browser. Please update.');
  }
  const kp = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  return { publicKey: kp.publicKey, privateKey: kp.privateKey };
}

function toBufferSource(u: Uint8Array): BufferSource {
  // Copy into a fresh Uint8Array backed by ArrayBuffer to satisfy
  // BufferSource (ArrayBufferView<ArrayBuffer>) under recent TS lib types.
  const out = new Uint8Array(u.byteLength);
  out.set(u);
  return out;
}

export async function exportPublicKey(key: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(raw);
}

export async function importPublicKey(rawBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', toBufferSource(rawBytes), { name: 'Ed25519' }, true, [
    'verify',
  ]);
}

export async function fingerprintFromPublicKey(rawBytes: Uint8Array): Promise<string> {
  const hashBuf = await crypto.subtle.digest('SHA-256', toBufferSource(rawBytes));
  const hash = new Uint8Array(hashBuf);
  return bytesToBase32(hash).slice(0, 12);
}

export async function signBytes(privateKey: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const sig = await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, toBufferSource(data));
  return new Uint8Array(sig);
}

export async function verifyBytes(
  publicKey: CryptoKey,
  signature: Uint8Array,
  data: Uint8Array
): Promise<boolean> {
  return crypto.subtle.verify(
    { name: 'Ed25519' },
    publicKey,
    toBufferSource(signature),
    toBufferSource(data)
  );
}

export function hasEd25519(): boolean {
  return typeof crypto !== 'undefined' && 'subtle' in crypto;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out;
}
