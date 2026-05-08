import { base64ToBytes, bytesToBase64 } from './keys';

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export const ENCRYPTED_FORMAT = 'privshare-encrypted';
export const ENCRYPTED_VERSION = 1;
export const ALGORITHM_LABEL = 'aes-gcm-256+pbkdf2-sha256-100k';

export interface EncryptedEnvelope {
  format: typeof ENCRYPTED_FORMAT;
  v: number;
  alg: typeof ALGORITHM_LABEL;
  saltB64: string;
  ivB64: string;
  ciphertextB64: string;
  innerFormat: string;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function toBufferSource(u: Uint8Array): BufferSource {
  const out = new Uint8Array(u.byteLength);
  out.set(u);
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    toBufferSource(utf8(passphrase)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toBufferSource(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptJson(
  json: unknown,
  passphrase: string,
  innerFormat: string
): Promise<EncryptedEnvelope> {
  if (passphrase.length < 8) {
    throw new Error('Passphrase must be at least 8 characters.');
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);
  const plaintext = utf8(JSON.stringify(json));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toBufferSource(iv) },
    key,
    toBufferSource(plaintext)
  );
  return {
    format: ENCRYPTED_FORMAT,
    v: ENCRYPTED_VERSION,
    alg: ALGORITHM_LABEL,
    saltB64: bytesToBase64(salt),
    ivB64: bytesToBase64(iv),
    ciphertextB64: bytesToBase64(new Uint8Array(cipherBuf)),
    innerFormat,
  };
}

export async function decryptJson<T>(envelope: EncryptedEnvelope, passphrase: string): Promise<T> {
  if (envelope.format !== ENCRYPTED_FORMAT) {
    throw new Error(`Not an encrypted PrivShare envelope (got ${envelope.format}).`);
  }
  if (envelope.v !== ENCRYPTED_VERSION) {
    throw new Error(`Unsupported envelope version ${envelope.v}.`);
  }
  if (envelope.alg !== ALGORITHM_LABEL) {
    throw new Error(`Unsupported algorithm ${envelope.alg}.`);
  }
  const salt = base64ToBytes(envelope.saltB64);
  const iv = base64ToBytes(envelope.ivB64);
  const ciphertext = base64ToBytes(envelope.ciphertextB64);
  const key = await deriveKey(passphrase, salt);
  let plainBuf: ArrayBuffer;
  try {
    plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toBufferSource(iv) },
      key,
      toBufferSource(ciphertext)
    );
  } catch {
    throw new Error('Wrong passphrase or corrupted file.');
  }
  const text = new TextDecoder().decode(plainBuf);
  return JSON.parse(text) as T;
}

export function isEncryptedEnvelope(maybe: unknown): maybe is EncryptedEnvelope {
  if (!maybe || typeof maybe !== 'object') return false;
  const m = maybe as Partial<EncryptedEnvelope>;
  return (
    m.format === ENCRYPTED_FORMAT &&
    typeof m.v === 'number' &&
    typeof m.saltB64 === 'string' &&
    typeof m.ivB64 === 'string' &&
    typeof m.ciphertextB64 === 'string'
  );
}
