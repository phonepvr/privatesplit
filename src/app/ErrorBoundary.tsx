import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    console.error('[PrivShare] Render error caught by boundary:', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10 text-slate-900">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-3 text-sm text-slate-600">
          A render error was caught. Your data is safe on this device. You can reload the app or
          report this to the developer with the message below.
        </p>
        <pre className="mt-4 overflow-auto rounded-md bg-slate-100 p-3 text-[11px] text-slate-800">
          {this.state.error.message}
        </pre>
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => location.reload()}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white"
          >
            Reload
          </button>
        </div>
      </main>
    );
  }
}
