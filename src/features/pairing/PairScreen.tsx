import { useEffect, useRef, useState } from 'react';
import { Header } from '../../app/shell/Header';
import { Button } from '../../ui/components/Button';
import { QrFrameView } from '../../ui/components/QrFrameView';
import { useGroups } from '../../stores/groups-store';
import { useSession } from '../../stores/session-store';
import { chunkForQr } from '../../core/pairing/codec';
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
  const [offerFrames, setOfferFrames] = useState<string[] | null>(null);
  const [answerInput, setAnswerInput] = useState('');
  const [offerInput, setOfferInput] = useState('');
  const [answerFrames, setAnswerFrames] = useState<string[] | null>(null);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<{ close: () => void } | null>(null);

  useEffect(() => () => sessionRef.current?.close(), []);

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
      setOfferFrames(chunkForQr(session.encodedOffer).map((f) => JSON.stringify(f)));
      setStatus('Show this QR to your partner. They will scan and send back an answer.');
      attachSyncToChannel(session.channel, groupId);
      session.channel.addEventListener('open', () => {
        setStatus('Connected. Syncing…');
        setMode('connected');
      });
      session.channel.addEventListener('close', () => setStatus('Disconnected.'));
      sessionRef.current = {
        close: () => {
          try {
            session.pc.close();
          } catch {
            /* ignore */
          }
        },
      };
      // Keep handle for accepting the answer
      (window as unknown as { __pairOfferSession: typeof session }).__pairOfferSession = session;
    } catch (err) {
      setError(String(err));
    }
  }

  async function pasteAnswer() {
    setError(null);
    try {
      const sess = (
        window as unknown as {
          __pairOfferSession?: { acceptAnswer: (s: string) => Promise<unknown> };
        }
      ).__pairOfferSession;
      if (!sess) throw new Error('No offer session in progress');
      await sess.acceptAnswer(answerInput);
      setStatus('Answer accepted. Waiting for channel to open…');
    } catch (err) {
      setError(String(err));
    }
  }

  async function startJoin() {
    if (!identity) return;
    setError(null);
    if (!offerInput.trim()) {
      setError('Paste the offer first.');
      return;
    }
    try {
      const session = await createAnswerSession({ identity, encodedOffer: offerInput.trim() });
      setAnswerFrames(chunkForQr(session.encodedAnswer).map((f) => JSON.stringify(f)));
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
      sessionRef.current = {
        close: () => {
          try {
            session.pc.close();
          } catch {
            /* ignore */
          }
        },
      };
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="pb-24">
      <Header title="Pair a device" back={onBack} />
      <div className="mx-auto max-w-md space-y-4 px-4 py-3">
        {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {status && <p className="text-sm text-slate-700">{status}</p>}
        {mode === 'choose' && (
          <>
            <p className="text-sm text-slate-600">
              Pairing exchanges a one-time code over the network. Make sure both phones are on the
              same WiFi.
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
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                className="mt-3"
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
                Paste the offer your partner&apos;s phone shows.
              </p>
              <Button className="mt-3" variant="secondary" onClick={() => setMode('join')}>
                I have an offer to paste
              </Button>
            </div>
          </>
        )}

        {mode === 'host' && (
          <>
            {offerFrames && <QrFrameView frames={offerFrames} />}
            <details className="rounded-lg bg-slate-50 p-3 text-xs">
              <summary>Show as raw text (paste-friendly)</summary>
              <textarea
                readOnly
                rows={6}
                className="mt-2 w-full font-mono text-[10px]"
                value={offerFrames?.join('\n') ?? ''}
                data-testid="pair-offer-payload"
              />
            </details>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Paste partner&apos;s answer</span>
              <textarea
                rows={4}
                value={answerInput}
                onChange={(e) => setAnswerInput(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-mono"
                data-testid="pair-answer-input"
              />
            </label>
            <Button onClick={pasteAnswer}>Accept answer</Button>
          </>
        )}

        {mode === 'join' && (
          <>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Paste partner&apos;s offer</span>
              <textarea
                rows={4}
                value={offerInput}
                onChange={(e) => setOfferInput(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-mono"
                data-testid="pair-offer-input"
              />
            </label>
            <Button onClick={startJoin}>Generate answer</Button>
            {answerFrames && (
              <>
                <QrFrameView frames={answerFrames} />
                <details className="rounded-lg bg-slate-50 p-3 text-xs">
                  <summary>Show as raw text (paste-friendly)</summary>
                  <textarea
                    readOnly
                    rows={6}
                    className="mt-2 w-full font-mono text-[10px]"
                    value={answerFrames.join('\n')}
                    data-testid="pair-answer-payload"
                  />
                </details>
              </>
            )}
          </>
        )}

        {mode === 'connected' && (
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
            Connected. You can leave this screen — sync continues in the background while the app is
            open on both devices.
          </p>
        )}
      </div>
    </div>
  );
}
