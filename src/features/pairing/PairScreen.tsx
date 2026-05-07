import { useEffect, useRef, useState } from 'react';
import { Header } from '../../app/shell/Header';
import { Button } from '../../ui/components/Button';
import { QrCanvas } from '../../ui/components/QrCanvas';
import { QrScanner } from '../../ui/components/QrScanner';
import { useGroups } from '../../stores/groups-store';
import { useSession } from '../../stores/session-store';
import { createAnswerSession, createOfferSession } from '../../core/pairing/handshake';
import { attachSyncToChannel } from '../../core/sync/transport';
import { newId } from '../../core/ids/ulid';
import { getGroupDoc } from '../../core/crdt/group-doc';

interface Props {
  onBack: () => void;
}

type Mode = 'choose' | 'host' | 'join' | 'connected';

export function PairScreen({ onBack }: Props) {
  const identity = useSession((s) => s.identity);
  const groups = useGroups((s) => s.groups);
  const [mode, setMode] = useState<Mode>('choose');
  const [groupId, setGroupId] = useState<string>(groups[0]?.id ?? '');
  const [offerPayload, setOfferPayload] = useState<string | null>(null);
  const [answerPayload, setAnswerPayload] = useState<string | null>(null);
  const [answerInput, setAnswerInput] = useState('');
  const [offerInput, setOfferInput] = useState('');
  const [scanFor, setScanFor] = useState<'offer' | 'answer' | null>(null);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const offerSessionRef = useRef<Awaited<ReturnType<typeof createOfferSession>> | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  useEffect(
    () => () => {
      try {
        pcRef.current?.close();
      } catch {
        /* ignore */
      }
    },
    []
  );

  async function startHost() {
    if (!identity || !groupId) return;
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    setError(null);
    setStatus('Building offer (gathering ICE candidates)…');
    try {
      const session = await createOfferSession({
        identity,
        groupId,
        groupName: group.name,
        currency: group.currency,
        groupKeyB64: newId(),
      });
      offerSessionRef.current = session;
      pcRef.current = session.pc;
      setOfferPayload(session.encodedOffer);
      setStatus('Show this QR to your partner. They will scan and send back an answer.');
      attachSyncToChannel(session.channel, groupId);
      session.channel.addEventListener('open', () => {
        setStatus('Connected. Syncing…');
        setMode('connected');
      });
      session.channel.addEventListener('close', () => setStatus('Disconnected.'));
    } catch (err) {
      setError(String(err));
    }
  }

  async function acceptAnswer(payload: string) {
    setError(null);
    try {
      const session = offerSessionRef.current;
      if (!session) throw new Error('No offer session in progress.');
      await session.acceptAnswer(payload);
      setStatus('Answer accepted. Waiting for channel to open…');
    } catch (err) {
      setError(`Couldn't read answer: ${String((err as Error).message ?? err)}`);
    }
  }

  async function startJoin(payload: string) {
    if (!identity) return;
    setError(null);
    if (!payload.trim()) {
      setError('Paste or scan the offer first.');
      return;
    }
    try {
      const session = await createAnswerSession({ identity, encodedOffer: payload.trim() });
      pcRef.current = session.pc;
      setAnswerPayload(session.encodedAnswer);
      setStatus('Show this answer back to the host.');
      session.channelPromise.then((channel) => {
        const invite = session.receivedOffer.groupInvite;
        const targetGroup = invite?.groupId ?? newId();
        if (invite) {
          const handle = getGroupDoc(targetGroup);
          handle.doc.transact(() => {
            if (!handle.meta.has('id')) {
              handle.meta.set('id', targetGroup);
              handle.meta.set('name', invite.groupName);
              handle.meta.set('currency', invite.currency);
              handle.meta.set('createdAt', new Date().toISOString());
              handle.meta.set('createdByFingerprint', session.receivedOffer.deviceFp);
            }
          });
          void useGroups.getState().watchGroup(targetGroup);
        }
        attachSyncToChannel(channel, targetGroup);
        channel.addEventListener('open', () => {
          setStatus('Connected. Syncing…');
          setMode('connected');
        });
      });
    } catch (err) {
      setError(`Couldn't read offer: ${String((err as Error).message ?? err)}`);
    }
  }

  return (
    <div className="pb-24">
      <Header title="Pair a device" back={onBack} />
      <div className="mx-auto max-w-md space-y-4 px-4 py-3">
        {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {status && <p className="text-sm text-slate-700">{status}</p>}

        {scanFor && (
          <div className="space-y-2">
            <QrScanner
              onResult={(text) => {
                setScanFor(null);
                if (scanFor === 'offer') {
                  setOfferInput(text);
                  void startJoin(text);
                } else {
                  setAnswerInput(text);
                  void acceptAnswer(text);
                }
              }}
              onError={(e) => setError(String((e as Error).message ?? e))}
            />
            <Button variant="ghost" onClick={() => setScanFor(null)} fullWidth>
              Cancel scan
            </Button>
          </div>
        )}

        {!scanFor && mode === 'choose' && (
          <>
            <p className="text-sm text-slate-600">
              Both phones must be on the same WiFi. Pairing happens device-to-device — no servers
              are involved.
            </p>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold">Host (existing device)</h3>
              <p className="mt-1 text-xs text-slate-500">
                Share one of your groups with another device.
              </p>
              <label className="mt-3 block">
                <span className="mb-1 block text-sm">Group</span>
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {groups.length === 0 && <option value="">No groups yet</option>}
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                className="mt-3"
                disabled={!groupId}
                onClick={() => {
                  setMode('host');
                  void startHost();
                }}
              >
                Start hosting
              </Button>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold">Join (new device)</h3>
              <p className="mt-1 text-xs text-slate-500">
                Scan the host&apos;s QR with this device&apos;s camera, or paste the host&apos;s
                code.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="primary" onClick={() => setScanFor('offer')}>
                  Scan QR
                </Button>
                <Button variant="secondary" onClick={() => setMode('join')}>
                  Paste code
                </Button>
              </div>
            </div>
          </>
        )}

        {!scanFor && mode === 'host' && (
          <>
            {offerPayload && <QrCanvas payload={offerPayload} />}
            <details className="rounded-lg bg-slate-50 p-3 text-xs">
              <summary>Show as paste-friendly text</summary>
              <textarea
                readOnly
                rows={4}
                className="mt-2 w-full font-mono text-[10px]"
                value={offerPayload ?? ''}
                data-testid="pair-offer-payload"
              />
              {offerPayload && (
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(offerPayload);
                    setStatus('Copied offer to clipboard.');
                  }}
                  className="mt-2 text-sky-600"
                >
                  Copy
                </button>
              )}
            </details>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold">Now: receive the answer</h3>
              <p className="mt-1 text-xs text-slate-500">
                After your partner scans the QR above, their phone will show an answer QR. Scan that
                or paste it below.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="primary" onClick={() => setScanFor('answer')}>
                  Scan answer QR
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (answerInput.trim()) void acceptAnswer(answerInput);
                  }}
                  disabled={!answerInput.trim()}
                >
                  Use pasted text
                </Button>
              </div>
              <textarea
                rows={3}
                placeholder="Paste partner's answer here"
                value={answerInput}
                onChange={(e) => setAnswerInput(e.target.value)}
                className="mt-3 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-mono"
                data-testid="pair-answer-input"
              />
            </div>
          </>
        )}

        {!scanFor && mode === 'join' && (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold">Paste the host&apos;s offer</h3>
              <textarea
                rows={4}
                value={offerInput}
                onChange={(e) => setOfferInput(e.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-mono"
                data-testid="pair-offer-input"
              />
              <Button
                className="mt-3"
                onClick={() => void startJoin(offerInput)}
                disabled={!offerInput.trim()}
              >
                Generate answer
              </Button>
            </div>

            {answerPayload && (
              <>
                <QrCanvas payload={answerPayload} />
                <details className="rounded-lg bg-slate-50 p-3 text-xs">
                  <summary>Show as paste-friendly text</summary>
                  <textarea
                    readOnly
                    rows={4}
                    className="mt-2 w-full font-mono text-[10px]"
                    value={answerPayload}
                    data-testid="pair-answer-payload"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(answerPayload);
                      setStatus('Copied answer to clipboard.');
                    }}
                    className="mt-2 text-sky-600"
                  >
                    Copy
                  </button>
                </details>
                <p className="text-xs text-slate-500">
                  Show this QR to the host (or paste the text into their answer field).
                </p>
              </>
            )}
          </>
        )}

        {!scanFor && mode === 'connected' && (
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
            Connected. You can leave this screen — sync continues in the background while the app is
            open on both devices.
          </p>
        )}
      </div>
    </div>
  );
}
