import { db } from './db';
import { exportPublicKey, fingerprintFromPublicKey, generateDeviceKeypair } from '../crypto/keys';

export interface LoadedIdentity {
  displayName: string;
  fingerprint: string;
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

let cached: LoadedIdentity | null = null;

export async function getIdentity(): Promise<LoadedIdentity | null> {
  if (cached) return cached;
  const row = await db().identity.get('self');
  if (!row) return null;
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    row.publicKeyJwk,
    { name: 'Ed25519' },
    true,
    ['verify']
  );
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    row.privateKeyJwk,
    { name: 'Ed25519' },
    false,
    ['sign']
  );
  cached = {
    displayName: row.displayName,
    fingerprint: row.fingerprint,
    publicKey,
    privateKey,
  };
  return cached;
}

export async function createIdentity(displayName: string): Promise<LoadedIdentity> {
  const kp = await generateDeviceKeypair();
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const raw = await exportPublicKey(kp.publicKey);
  const fingerprint = await fingerprintFromPublicKey(raw);
  await db().identity.put({
    id: 'self',
    displayName,
    fingerprint,
    publicKeyJwk,
    privateKeyJwk,
    createdAt: new Date().toISOString(),
  });
  cached = { displayName, fingerprint, publicKey: kp.publicKey, privateKey: kp.privateKey };
  return cached;
}

export async function updateDisplayName(name: string): Promise<void> {
  await db().identity.update('self', { displayName: name });
  if (cached) cached = { ...cached, displayName: name };
}

export function clearIdentityCache(): void {
  cached = null;
}
