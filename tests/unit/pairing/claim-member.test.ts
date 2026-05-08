import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { claimOrInsertMember, addMember, initGroupDoc } from '../../../src/core/crdt/operations';
import { getGroupDoc } from '../../../src/core/crdt/group-doc';
import { newId } from '../../../src/core/ids/ulid';

// happy-dom doesn't ship IndexedDB, so y-indexeddb is a no-op here. The
// in-memory Y.Doc is still real.
describe('claimOrInsertMember', () => {
  it('claims the first unclaimed member if any', async () => {
    const groupId = newId();
    initGroupDoc({
      groupId,
      name: 'Goa',
      currency: 'INR',
      createdByFingerprint: 'HOST-FP-1',
    });
    addMember(groupId, { name: 'Alex', color: '#0ea5e9', claimedByFingerprint: 'HOST-FP-1' });
    addMember(groupId, { name: 'Priya placeholder', color: '#f97316' });

    const result = claimOrInsertMember(groupId, {
      displayName: 'Priya',
      fingerprint: 'JOINER-FP-1',
      color: '#f97316',
    });

    expect(result.claimedExisting).toBe(true);
    const handle = getGroupDoc(groupId);
    const claimed = handle.members
      .toArray()
      .find((m: Y.Map<unknown>) => m.get('claimedByFingerprint') === 'JOINER-FP-1');
    expect(claimed?.get('name')).toBe('Priya');
    expect(handle.members.length).toBe(2);
  });

  it('inserts a new member when no placeholder exists', async () => {
    const groupId = newId();
    initGroupDoc({
      groupId,
      name: 'Solo',
      currency: 'INR',
      createdByFingerprint: 'HOST-FP-2',
    });
    addMember(groupId, { name: 'Alex', color: '#0ea5e9', claimedByFingerprint: 'HOST-FP-2' });

    const result = claimOrInsertMember(groupId, {
      displayName: 'Bob',
      fingerprint: 'JOINER-FP-2',
      color: '#10b981',
    });

    expect(result.claimedExisting).toBe(false);
    const handle = getGroupDoc(groupId);
    expect(handle.members.length).toBe(2);
    const bob = handle.members
      .toArray()
      .find((m: Y.Map<unknown>) => m.get('claimedByFingerprint') === 'JOINER-FP-2');
    expect(bob?.get('name')).toBe('Bob');
  });

  it('is idempotent on a second call with the same fingerprint', async () => {
    const groupId = newId();
    initGroupDoc({
      groupId,
      name: 'Idempotent',
      currency: 'INR',
      createdByFingerprint: 'HOST-FP-3',
    });
    const first = claimOrInsertMember(groupId, {
      displayName: 'Sam',
      fingerprint: 'FP-SAM',
      color: '#a855f7',
    });
    const second = claimOrInsertMember(groupId, {
      displayName: 'Sam-renamed',
      fingerprint: 'FP-SAM',
      color: '#a855f7',
    });
    expect(first.memberId).toBe(second.memberId);
    const handle = getGroupDoc(groupId);
    expect(handle.members.length).toBe(1);
  });
});
