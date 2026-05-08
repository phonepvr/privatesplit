interface Row {
  status: 'protected' | 'caveat' | 'deferred';
  label: string;
}

const ROWS: Row[] = [
  { status: 'protected', label: 'All your data lives on this device (IndexedDB).' },
  {
    status: 'protected',
    label: 'Backup files are encrypted with a passphrase you choose (AES-GCM-256, PBKDF2 100k).',
  },
  {
    status: 'protected',
    label: 'The app makes no external network calls. The service worker blocks them.',
  },
  {
    status: 'protected',
    label: 'Sync between paired phones happens directly over WebRTC (DTLS-encrypted). No servers.',
  },
  {
    status: 'caveat',
    label:
      'Pairing codes contain the group’s name and currency in plaintext. Share them privately.',
  },
  { status: 'deferred', label: 'The local database is not yet encrypted at rest. Coming in v2.' },
];

const STYLES: Record<Row['status'], string> = {
  protected: 'text-emerald-700',
  caveat: 'text-amber-700',
  deferred: 'text-slate-500',
};

const ICONS: Record<Row['status'], string> = {
  protected: '✓',
  caveat: '!',
  deferred: '◷',
};

export function PrivacySummary() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold">Privacy</h3>
      <ul className="mt-2 space-y-2 text-xs">
        {ROWS.map((r, i) => (
          <li key={i} className={`flex gap-2 ${STYLES[r.status]}`}>
            <span aria-hidden className="font-semibold">
              {ICONS[r.status]}
            </span>
            <span>{r.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
