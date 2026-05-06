import Dexie, { type Table } from 'dexie';
import type { CurrencyCode } from '../money/types';

export interface DeviceIdentityRow {
  id: 'self';
  displayName: string;
  fingerprint: string;
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
  createdAt: string;
}

export interface GroupRow {
  id: string;
  name: string;
  currency: CurrencyCode;
  createdAt: string;
  archivedAt?: string;
  deletedAt?: string;
}

export interface MemberCacheRow {
  id: string;
  groupId: string;
  name: string;
  color: string;
  claimedByFingerprint?: string;
  removedAt?: string;
}

export interface ExpenseCacheRow {
  id: string;
  groupId: string;
  description: string;
  amountMinor: number;
  date: string;
  category: string;
  notes?: string;
  paidByMemberId: string;
  splitType: 'equal' | 'exact';
  participants: string[];
  exactShares?: { memberId: string; amountMinor: number }[];
  createdByFingerprint: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface SettlementCacheRow {
  id: string;
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
  date: string;
  note?: string;
  createdByFingerprint: string;
  createdAt: string;
  deletedAt?: string;
}

export interface PeerRow {
  fingerprint: string;
  displayName: string;
  publicKeyRawB64: string;
  trustedAt: string;
  lastSeenAt?: string;
  sharedGroupIds: string[];
}

export interface AuditLogRow {
  id?: number;
  ts: string;
  level: 'info' | 'warn' | 'error';
  source: string;
  message: string;
  data?: unknown;
}

export class PrivShareDb extends Dexie {
  identity!: Table<DeviceIdentityRow, 'self'>;
  groups!: Table<GroupRow, string>;
  members!: Table<MemberCacheRow, string>;
  expenses!: Table<ExpenseCacheRow, string>;
  settlements!: Table<SettlementCacheRow, string>;
  peers!: Table<PeerRow, string>;
  diagnostics!: Table<AuditLogRow, number>;

  constructor() {
    super('privshare');
    this.version(1).stores({
      identity: 'id',
      groups: 'id, archivedAt, deletedAt',
      members: 'id, groupId, removedAt',
      expenses: 'id, groupId, date, deletedAt',
      settlements: 'id, groupId, date, deletedAt',
      peers: 'fingerprint',
      diagnostics: '++id, ts',
    });
  }
}

let dbInstance: PrivShareDb | null = null;
export function db(): PrivShareDb {
  if (!dbInstance) dbInstance = new PrivShareDb();
  return dbInstance;
}
