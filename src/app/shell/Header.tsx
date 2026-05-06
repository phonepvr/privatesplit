import type { ReactNode } from 'react';

interface Props {
  title: string;
  back?: () => void;
  right?: ReactNode;
}

export function Header({ title, back, right }: Props) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-3 py-2 backdrop-blur">
      <div className="flex items-center gap-2">
        {back ? (
          <button
            onClick={back}
            className="rounded-md px-2 py-1 text-base text-slate-600 hover:bg-slate-100"
            aria-label="Back"
          >
            ←
          </button>
        ) : (
          <span className="ml-1 inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-emerald-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Local
          </span>
        )}
        <h1 className="text-base font-semibold text-slate-900">{title}</h1>
      </div>
      <div className="flex items-center gap-2">{right}</div>
    </header>
  );
}
