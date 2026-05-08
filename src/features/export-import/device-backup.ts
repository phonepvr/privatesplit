import * as Y from 'yjs';
import { db, type PeerRow } from '../../core/storage/db';
import { getGroupDoc } from '../../core/crdt/group-doc';
import { base64ToBytes, bytesToBase64, exportPublicKey, signBytes } from '../../core/crypto/keys';
import {
  decryptJson,
  encryptJson,
  isEncryptedEnvelope,
  type EncryptedEnvelope,
} from '../../core/crypto/passphrase';
import { adoptIdentity, type LoadedIdentity } from '../../core/storage/identity';
import { useGroups } from '../../stores/groups-store';

export const DEVICE_BACKUP_FORMAT = 'privshare-device-backup';
// v2: backup file now contains the wrapped private key + persisted peers so
// a restore on a clean device produces an identical, paired install.
export const DEVICE_BACKUP_VERSION = 2;

interface BackupGroup {
  groupId: string;
  groupName: string;
  payloadB64: string;
}

export interface DeviceBackupFile {
  format: typeof DEVICE_BACKUP_FORMAT;
  v: number;
  exportedAt: string;
  exportedByFingerprint: string;
  exportedByDisplayName: string;
  exporterPublicKeyB64: string;
  identity: {
    displayName: string;
    fingerprint: string;
    publicKeyJwk: JsonWebKey;
    privateKeyJwk?: JsonWebKey; // present in v2; absent in legacy v1 backups
  };
  groups: BackupGroup[];
  peers?: PeerRow[]; // v2: paired peer credentials so reconnect just works
  bundleSha256B64: string;
  signatureB64: string;
}

function concatStrings(parts: string[]): Uint8Array {
  const text = parts.join('|');
  return new TextEncoder().encode(text);
}

export async function exportDeviceAsBlob(
  identity: LoadedIdentity,
  passphrase: string
): Promise<Blob> {
  const groups = await db().groups.toArray();
  const live = groups.filter((g) => !g.deletedAt);

  const backupGroups: BackupGroup[] = [];
  for (const g of live) {
    const handle = getGroupDoc(g.id);
    await handle.ready;
    const update = Y.encodeStateAsUpdate(handle.doc);
    backupGroups.push({
      groupId: g.id,
      groupName: g.name,
      payloadB64: bytesToBase64(update),
    });
  }

  const publicKeyJwk = await crypto.subtle.exportKey('jwk', identity.publicKey);
  // The Ed25519 private key only exports as JWK if it was created with
  // extractable=true (which we do in createIdentity). It's already protected
  // by the outer passphrase envelope.
  let privateKeyJwk: JsonWebKey | undefined;
  try {
    privateKeyJwk = await crypto.subtle.exportKey('jwk', identity.privateKey);
  } catch {
    privateKeyJwk = undefined;
  }
  const rawPub = await exportPublicKey(identity.publicKey);
  const peers = await db().peers.toArray();

  const bundleBytes = concatStrings([
    DEVICE_BACKUP_FORMAT,
    String(DEVICE_BACKUP_VERSION),
    identity.fingerprint,
    ...backupGroups.flatMap((g) => [g.groupId, g.payloadB64]),
  ]);
  const bundleForDigest = new Uint8Array(bundleBytes.byteLength);
  bundleForDigest.set(bundleBytes);
  const sha = new Uint8Array(await crypto.subtle.digest('SHA-256', bundleForDigest));
  const sig = await signBytes(identity.privateKey, sha);

  const file: DeviceBackupFile = {
    format: DEVICE_BACKUP_FORMAT,
    v: DEVICE_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    exportedByFingerprint: identity.fingerprint,
    exportedByDisplayName: identity.displayName,
    exporterPublicKeyB64: bytesToBase64(rawPub),
    identity: {
      displayName: identity.displayName,
      fingerprint: identity.fingerprint,
      publicKeyJwk,
      ...(privateKeyJwk ? { privateKeyJwk } : {}),
    },
    groups: backupGroups,
    peers,
    bundleSha256B64: bytesToBase64(sha),
    signatureB64: bytesToBase64(sig),
  };
  const envelope = await encryptJson(file, passphrase, DEVICE_BACKUP_FORMAT);
  return new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
}

export interface DeviceImportResult {
  ok: boolean;
  reason?: string;
  importedGroupCount: number;
  exportedByDisplayName?: string;
  exportedByFingerprint?: string;
  identityAdopted?: boolean;
}

export async function importDeviceBackupFile(
  text: string,
  passphrase?: string
): Promise<DeviceImportResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'Invalid JSON', importedGroupCount: 0 };
  }
  let parsed: DeviceBackupFile;
  if (isEncryptedEnvelope(raw)) {
    if (!passphrase) {
      return {
        ok: false,
        reason: 'This backup is encrypted. Provide the passphrase.',
        importedGroupCount: 0,
      };
    }
    try {
      parsed = await decryptJson<DeviceBackupFile>(raw as EncryptedEnvelope, passphrase);
    } catch (err) {
      return {
        ok: false,
        reason: String((err as Error).message ?? err),
        importedGroupCount: 0,
      };
    }
  } else {
    parsed = raw as DeviceBackupFile;
  }
  if (parsed.format !== DEVICE_BACKUP_FORMAT) {
    return {
      ok: false,
      reason: `Unsupported format (${parsed.format})`,
      importedGroupCount: 0,
    };
  }
  // Accept v1 (legacy) and v2; v1 simply lacks the private key + peers fields.
  if (parsed.v !== 1 && parsed.v !== DEVICE_BACKUP_VERSION) {
    return {
      ok: false,
      reason: `Unsupported version (${parsed.v})`,
      importedGroupCount: 0,
    };
  }

  // If the local install has no identity yet AND the backup carries one with
  // a private key, adopt it. This is what the restore-first onboarding path
  // relies on so a restored device keeps the same fingerprint.
  let identityAdopted = false;
  const existingIdentity = await db().identity.get('self');
  if (
    !existingIdentity &&
    parsed.identity?.privateKeyJwk &&
    parsed.identity.publicKeyJwk &&
    parsed.identity.fingerprint &&
    parsed.identity.displayName
  ) {
    try {
      await adoptIdentity({
        displayName: parsed.identity.displayName,
        fingerprint: parsed.identity.fingerprint,
        publicKeyJwk: parsed.identity.publicKeyJwk,
        privateKeyJwk: parsed.identity.privateKeyJwk,
      });
      identityAdopted = true;
    } catch (err) {
      console.error('[PrivShare] adoptIdentity failed', err);
    }
  }

  // Restore paired peer credentials so reconnects skip the wizard.
  if (parsed.peers && parsed.peers.length > 0) {
    try {
      await db().peers.bulkPut(parsed.peers);
    } catch (err) {
      console.error('[PrivShare] peer restore failed', err);
    }
  }

  // Apply each group's Yjs update. The CRDT semantics merge into existing
  // group docs (if a doc with the same groupId already exists locally), or
  // create a fresh one if not.
  let imported = 0;
  for (const g of parsed.groups) {
    const payload = base64ToBytes(g.payloadB64);
    const handle = getGroupDoc(g.groupId);
    await handle.ready;
    Y.applyUpdate(handle.doc, payload);
    handle.doc.transact(() => {
      if (!handle.meta.has('id')) {
        handle.meta.set('id', g.groupId);
        handle.meta.set('createdAt', new Date().toISOString());
      }
      if (!handle.meta.has('name')) handle.meta.set('name', g.groupName);
    });
    await useGroups.getState().watchGroup(g.groupId);
    imported += 1;
  }

  const result: DeviceImportResult = {
    ok: true,
    importedGroupCount: imported,
    exportedByDisplayName: parsed.exportedByDisplayName,
    exportedByFingerprint: parsed.exportedByFingerprint,
    ...(identityAdopted ? { identityAdopted: true } : {}),
  };
  return result;
}
