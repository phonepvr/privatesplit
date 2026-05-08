import * as Y from 'yjs';
import { getGroupDoc } from '../../core/crdt/group-doc';
import { hydrateGroupCache } from '../../core/storage/hydration';
import { newId } from '../../core/ids/ulid';
import {
  base64ToBytes,
  bytesToBase64,
  exportPublicKey,
  importPublicKey,
  signBytes,
  verifyBytes,
} from '../../core/crypto/keys';
import {
  decryptJson,
  encryptJson,
  isEncryptedEnvelope,
  type EncryptedEnvelope,
} from '../../core/crypto/passphrase';
import type { LoadedIdentity } from '../../core/storage/identity';

export const PRIVSHARE_FORMAT = 'privshare';
export const PRIVSHARE_VERSION = 1;

export interface PrivShareFile {
  format: typeof PRIVSHARE_FORMAT;
  v: number;
  groupId: string;
  groupName: string;
  exportedAt: string;
  exportedByFingerprint: string;
  exportedByDisplayName: string;
  exporterPublicKeyB64: string;
  payloadB64: string;
  payloadSha256B64: string;
  signatureB64: string;
}

export async function exportGroupAsBlob(
  groupId: string,
  identity: LoadedIdentity,
  passphrase: string
): Promise<Blob> {
  const handle = getGroupDoc(groupId);
  await handle.ready;
  const update = Y.encodeStateAsUpdate(handle.doc);
  const payloadB64 = bytesToBase64(update);
  const updateForDigest = new Uint8Array(update.byteLength);
  updateForDigest.set(update);
  const sha = new Uint8Array(await crypto.subtle.digest('SHA-256', updateForDigest));
  const sig = await signBytes(identity.privateKey, sha);
  const rawPub = await exportPublicKey(identity.publicKey);
  const file: PrivShareFile = {
    format: PRIVSHARE_FORMAT,
    v: PRIVSHARE_VERSION,
    groupId,
    groupName: (handle.meta.get('name') as string) ?? 'group',
    exportedAt: new Date().toISOString(),
    exportedByFingerprint: identity.fingerprint,
    exportedByDisplayName: identity.displayName,
    exporterPublicKeyB64: bytesToBase64(rawPub),
    payloadB64,
    payloadSha256B64: bytesToBase64(sha),
    signatureB64: bytesToBase64(sig),
  };
  const envelope = await encryptJson(file, passphrase, PRIVSHARE_FORMAT);
  return new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
}

export interface ImportResult {
  ok: boolean;
  groupId: string;
  groupName: string;
  signatureValid: boolean;
  reason?: string;
  importedAsNewGroupId?: string;
}

export async function importPrivShareFile(
  fileText: string,
  options: {
    mode: 'new' | 'merge';
    targetGroupId?: string;
    passphrase?: string;
  } = { mode: 'new' }
): Promise<ImportResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(fileText);
  } catch {
    return { ok: false, groupId: '', groupName: '', signatureValid: false, reason: 'Invalid JSON' };
  }
  let parsed: PrivShareFile;
  if (isEncryptedEnvelope(raw)) {
    if (!options.passphrase) {
      return {
        ok: false,
        groupId: '',
        groupName: '',
        signatureValid: false,
        reason: 'This backup is encrypted. Provide the passphrase.',
      };
    }
    try {
      parsed = await decryptJson<PrivShareFile>(raw as EncryptedEnvelope, options.passphrase);
    } catch (err) {
      return {
        ok: false,
        groupId: '',
        groupName: '',
        signatureValid: false,
        reason: String((err as Error).message ?? err),
      };
    }
  } else {
    parsed = raw as PrivShareFile;
  }
  if (parsed.format !== PRIVSHARE_FORMAT || parsed.v !== PRIVSHARE_VERSION) {
    return {
      ok: false,
      groupId: parsed.groupId ?? '',
      groupName: parsed.groupName ?? '',
      signatureValid: false,
      reason: `Unsupported format/version (${parsed.format}/${parsed.v})`,
    };
  }
  const payload = base64ToBytes(parsed.payloadB64);
  const payloadForDigest = new Uint8Array(payload.byteLength);
  payloadForDigest.set(payload);
  const sha = new Uint8Array(await crypto.subtle.digest('SHA-256', payloadForDigest));
  const expectedSha = base64ToBytes(parsed.payloadSha256B64);
  if (!equalBytes(sha, expectedSha)) {
    return {
      ok: false,
      groupId: parsed.groupId,
      groupName: parsed.groupName,
      signatureValid: false,
      reason: 'Payload checksum mismatch (file may be corrupted or tampered).',
    };
  }
  let signatureValid = false;
  try {
    const pub = await importPublicKey(base64ToBytes(parsed.exporterPublicKeyB64));
    signatureValid = await verifyBytes(pub, base64ToBytes(parsed.signatureB64), sha);
  } catch {
    signatureValid = false;
  }

  let targetGroupId = parsed.groupId;
  if (options.mode === 'new') {
    targetGroupId = newId();
  } else if (options.mode === 'merge' && options.targetGroupId) {
    targetGroupId = options.targetGroupId;
  }
  const handle = getGroupDoc(targetGroupId);
  await handle.ready;
  Y.applyUpdate(handle.doc, payload);

  if (options.mode === 'new') {
    handle.doc.transact(() => {
      handle.meta.set('id', targetGroupId);
      if (!handle.meta.has('createdAt')) {
        handle.meta.set('createdAt', new Date().toISOString());
      }
    });
  }

  await hydrateGroupCache(targetGroupId);

  const result: ImportResult = {
    ok: true,
    groupId: parsed.groupId,
    groupName: parsed.groupName,
    signatureValid,
  };
  if (options.mode === 'new') result.importedAsNewGroupId = targetGroupId;
  return result;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}
