import { useGroups, type SyncStatus } from '../../stores/groups-store';

const LABEL: Record<SyncStatus, string> = {
  idle: 'Local only',
  opening: 'Connecting…',
  exchanging: 'Exchanging history…',
  synced: 'Synced',
  closed: 'Disconnected',
  error: 'Error',
};

const COLOR: Record<SyncStatus, string> = {
  idle: 'bg-slate-100 text-slate-600',
  opening: 'bg-amber-100 text-amber-700',
  exchanging: 'bg-amber-100 text-amber-700',
  synced: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-slate-200 text-slate-600',
  error: 'bg-rose-100 text-rose-700',
};

interface Props {
  groupId: string;
}

export function SyncPill({ groupId }: Props) {
  const status = useGroups((s) => s.syncStatusByGroup.get(groupId) ?? 'idle');
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${COLOR[status]}`}
      data-testid="sync-pill"
      data-status={status}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {LABEL[status]}
    </span>
  );
}

export function ConnectedPanel({ groupId }: { groupId: string | null }) {
  if (!groupId) return null;
  return (
    <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
      <p className="font-semibold">Connected.</p>
      <p className="mt-1 text-xs">
        Status: <SyncPill groupId={groupId} />
      </p>
      <p className="mt-2 text-xs">
        Sync continues in the background while the app is open on both devices.
      </p>
    </div>
  );
}
