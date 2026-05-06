import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';

const docs = new Map<
  string,
  { doc: Y.Doc; persistence: IndexeddbPersistence; ready: Promise<void> }
>();

export interface GroupDocHandle {
  doc: Y.Doc;
  meta: Y.Map<unknown>;
  members: Y.Array<Y.Map<unknown>>;
  expenses: Y.Array<Y.Map<unknown>>;
  settlements: Y.Array<Y.Map<unknown>>;
  ready: Promise<void>;
}

export function getGroupDoc(groupId: string): GroupDocHandle {
  let entry = docs.get(groupId);
  if (!entry) {
    const doc = new Y.Doc({ guid: `group:${groupId}` });
    const persistence = new IndexeddbPersistence(`privshare-group-${groupId}`, doc);
    const ready = new Promise<void>((resolve) => {
      persistence.once('synced', () => resolve());
    });
    entry = { doc, persistence, ready };
    docs.set(groupId, entry);
  }
  const doc = entry.doc;
  return {
    doc,
    meta: doc.getMap('meta'),
    members: doc.getArray<Y.Map<unknown>>('members'),
    expenses: doc.getArray<Y.Map<unknown>>('expenses'),
    settlements: doc.getArray<Y.Map<unknown>>('settlements'),
    ready: entry.ready,
  };
}

export async function destroyGroupDoc(groupId: string): Promise<void> {
  const entry = docs.get(groupId);
  if (!entry) return;
  await entry.persistence.destroy();
  entry.doc.destroy();
  docs.delete(groupId);
}

export function findById<T extends Y.Map<unknown>>(arr: Y.Array<T>, id: string): T | null {
  for (let i = 0; i < arr.length; i += 1) {
    const item = arr.get(i);
    if (item.get('id') === id) return item;
  }
  return null;
}

export function findIndexById<T extends Y.Map<unknown>>(arr: Y.Array<T>, id: string): number {
  for (let i = 0; i < arr.length; i += 1) {
    if (arr.get(i).get('id') === id) return i;
  }
  return -1;
}
