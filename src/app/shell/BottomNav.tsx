import { useUi, type Tab } from '../../stores/ui-store';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'groups', label: 'Groups', icon: '👥' },
  { id: 'activity', label: 'Activity', icon: '📋' },
  { id: 'profile', label: 'Profile', icon: '⚙️' },
];

export function BottomNav() {
  const active = useUi((s) => s.activeTab);
  const setTab = useUi((s) => s.setTab);
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-md justify-around">
        {TABS.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex flex-col items-center gap-0.5 px-6 py-2 text-xs font-medium ${
                active === t.id ? 'text-sky-600' : 'text-slate-500'
              }`}
              aria-current={active === t.id ? 'page' : undefined}
            >
              <span aria-hidden>{t.icon}</span>
              {t.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
