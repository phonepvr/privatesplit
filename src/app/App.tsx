import { useEffect, useState } from 'react';
import { useSession } from '../stores/session-store';
import { useGroups } from '../stores/groups-store';
import { useUi } from '../stores/ui-store';
import { Onboarding } from '../features/onboarding/Onboarding';
import { GroupsList } from '../features/groups/GroupsList';
import { GroupDetail } from '../features/groups/GroupDetail';
import { ActivityFeed } from '../features/activity/ActivityFeed';
import { Profile } from '../features/settings/Profile';
import { PairScreen } from '../features/pairing/PairScreen';
import { Trash } from '../features/trash/Trash';
import { Diagnostics } from '../features/diagnostics/Diagnostics';
import { BottomNav } from './shell/BottomNav';
import { UpdateBanner } from './UpdateBanner';
import { InstallPrompt } from './InstallPrompt';
import { installConsoleCapture } from '../core/diagnostics/log';

type Modal = null | 'pair' | 'trash' | 'diagnostics';

export default function App() {
  const ready = useSession((s) => s.ready);
  const identity = useSession((s) => s.identity);
  const loadSession = useSession((s) => s.load);
  const bootstrapGroups = useGroups((s) => s.bootstrap);
  const tab = useUi((s) => s.activeTab);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);

  useEffect(() => {
    installConsoleCapture();
    void loadSession();
    void navigator.storage?.persist?.();
  }, [loadSession]);

  useEffect(() => {
    if (identity) void bootstrapGroups();
  }, [identity, bootstrapGroups]);

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center text-slate-500">Loading…</main>
    );
  }
  if (!identity) {
    return (
      <>
        <UpdateBanner />
        <Onboarding />
      </>
    );
  }

  let body: JSX.Element;
  if (modal === 'pair') {
    body = <PairScreen onBack={() => setModal(null)} />;
  } else if (modal === 'trash') {
    body = <Trash onBack={() => setModal(null)} />;
  } else if (modal === 'diagnostics') {
    body = <Diagnostics onBack={() => setModal(null)} />;
  } else if (openGroupId) {
    body = <GroupDetail groupId={openGroupId} onBack={() => setOpenGroupId(null)} />;
  } else if (tab === 'groups') {
    body = <GroupsList onOpenGroup={setOpenGroupId} />;
  } else if (tab === 'activity') {
    body = <ActivityFeed />;
  } else {
    body = (
      <Profile
        onOpenPair={() => setModal('pair')}
        onOpenDiagnostics={() => setModal('diagnostics')}
        onOpenTrash={() => setModal('trash')}
      />
    );
  }

  const navHidden = openGroupId !== null || modal !== null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <UpdateBanner />
      {body}
      {!navHidden && <BottomNav />}
      <InstallPrompt />
    </div>
  );
}
