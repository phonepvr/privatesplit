import { base64ToBytes, bytesToBase64 } from './keys';

const SALT = new TextEncoder().encode('privshare-pairing-v1');
const ITERATIONS = 100_000;

function toBufferSource(u: Uint8Array): BufferSource {
  const out = new Uint8Array(u.byteLength);
  out.set(u);
  return out;
}

export function newPairingId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64(bytes);
}

async function deriveAesKey(pairingId: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    toBufferSource(base64ToBytes(pairingId)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toBufferSource(SALT), iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function deriveSharedKeyB64(pairingId: string): Promise<string> {
  const key = await deriveAesKey(pairingId);
  const raw = await crypto.subtle.exportKey('raw', key);
  return bytesToBase64(new Uint8Array(raw));
}

async function importSharedKey(sharedKeyB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    toBufferSource(base64ToBytes(sharedKeyB64)),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

export interface SealedBlob {
  ivB64: string;
  ciphertextB64: string;
}

export async function sealWithSharedKey(
  sharedKeyB64: string,
  plaintext: string
): Promise<SealedBlob> {
  const key = await importSharedKey(sharedKeyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toBufferSource(iv) },
    key,
    toBufferSource(data)
  );
  return {
    ivB64: bytesToBase64(iv),
    ciphertextB64: bytesToBase64(new Uint8Array(cipher)),
  };
}

export async function openWithSharedKey(sharedKeyB64: string, blob: SealedBlob): Promise<string> {
  const key = await importSharedKey(sharedKeyB64);
  const iv = base64ToBytes(blob.ivB64);
  const ct = base64ToBytes(blob.ciphertextB64);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toBufferSource(iv) },
    key,
    toBufferSource(ct)
  );
  return new TextDecoder().decode(plain);
}
