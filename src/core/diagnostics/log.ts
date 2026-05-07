import { db } from '../storage/db';

const MAX_LOGS = 500;

export type LogLevel = 'info' | 'warn' | 'error';

export async function appendLog(
  level: LogLevel,
  source: string,
  message: string,
  data?: unknown
): Promise<void> {
  await db().diagnostics.add({
    ts: new Date().toISOString(),
    level,
    source,
    message,
    data,
  });
  const count = await db().diagnostics.count();
  if (count > MAX_LOGS) {
    const overflow = count - MAX_LOGS;
    const oldest = await db().diagnostics.orderBy('ts').limit(overflow).primaryKeys();
    await db().diagnostics.bulkDelete(oldest);
  }
}

export async function fetchLogs(): Promise<
  { id: number; ts: string; level: LogLevel; source: string; message: string; data?: unknown }[]
> {
  const rows = await db().diagnostics.orderBy('ts').reverse().limit(MAX_LOGS).toArray();
  return rows
    .filter((r): r is typeof r & { id: number } => typeof r.id === 'number')
    .map((r) => {
      const out: {
        id: number;
        ts: string;
        level: LogLevel;
        source: string;
        message: string;
        data?: unknown;
      } = {
        id: r.id,
        ts: r.ts,
        level: r.level,
        source: r.source,
        message: r.message,
      };
      if (r.data !== undefined) out.data = r.data;
      return out;
    });
}

export async function clearLogs(): Promise<void> {
  await db().diagnostics.clear();
}

let captureInstalled = false;

export function installConsoleCapture(): void {
  if (captureInstalled) return;
  captureInstalled = true;
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  console.warn = (...args: unknown[]) => {
    void appendLog('warn', 'console', args.map(String).join(' '));
    origWarn(...args);
  };
  console.error = (...args: unknown[]) => {
    void appendLog('error', 'console', args.map(String).join(' '));
    origError(...args);
  };
}
