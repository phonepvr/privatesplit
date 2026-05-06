import { useUi } from '../stores/ui-store';

export function UpdateBanner() {
  const visible = useUi((s) => s.swUpdateAvailable);
  if (!visible) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-sky-600 text-white">
      <div className="mx-auto flex max-w-md items-center justify-between px-4 py-2 text-sm">
        <span>Update available.</span>
        <button
          onClick={() => location.reload()}
          className="rounded-md bg-white/20 px-3 py-1 text-xs font-medium hover:bg-white/30"
        >
          Restart
        </button>
      </div>
    </div>
  );
}
