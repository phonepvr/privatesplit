import { useEffect, useRef, useState } from 'react';
import { Header } from '../../app/shell/Header';
import { Button } from '../../ui/components/Button';
import { useGroups } from '../../stores/groups-store';
import { useSession } from '../../stores/session-store';
import { createAnswerSession, createOfferSession } from '../../core/pairing/handshake';
import { attachSyncToChannel } from '../../core/sync/transport';
import { newId } from '../../core/ids/ulid';
import { getGroupDoc } from '../../core/crdt/group-doc';
import { ConnectedPanel } from './SyncPill';

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
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const offerSessionRef = useRef<Awaited<ReturnType<typeof createOfferSession>> | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const answerAppliedRef = useRef(false);
  const joinStartedRef = useRef(false);
  const [connectedGroupId, setConnectedGroupId] = useState<string | null>(null);

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
      setStatus(
        'Send this code to your partner. They paste it on their phone and send back an answer.'
      );
      attachSyncToChannel(session.channel, groupId, 'host');
      session.channel.addEventListener('open', () => {
        setStatus('Connected. Syncing…');
        setConnectedGroupId(groupId);
        setMode('connected');
      });
      session.channel.addEventListener('close', () => setStatus('Disconnected.'));
    } catch (err) {
      setError(String(err));
    }
  }

  async function acceptAnswer(payload: string) {
    setError(null);
    if (answerAppliedRef.current) {
      setStatus('Answer already accepted — waiting for channel.');
      return;
    }
    if (!payload.trim()) {
      setError('Empty answer — paste the partner’s code first.');
      return;
    }
    const session = offerSessionRef.current;
    if (!session) {
      setError('No offer session is open. Start hosting again.');
      return;
    }
    if (session.pc.signalingState !== 'have-local-offer') {
      setError(
        `Cannot apply answer: connection is in "${session.pc.signalingState}" state. Start hosting again.`
      );
      return;
    }
    answerAppliedRef.current = true;
    try {
      await session.acceptAnswer(payload);
      setStatus('Answer accepted. Waiting for channel to open…');
    } catch (err) {
      answerAppliedRef.current = false;
      setError(`Couldn't read answer: ${String((err as Error).message ?? err)}`);
    }
  }

  async function startJoin(payload: string) {
    if (!identity) return;
    setError(null);
    if (joinStartedRef.current) return;
    if (!payload.trim()) {
      setError('Paste the offer first.');
      return;
    }
    joinStartedRef.current = true;
    try {
      const session = await createAnswerSession({ identity, encodedOffer: payload.trim() });
      pcRef.current = session.pc;
      setAnswerPayload(session.encodedAnswer);
      setStatus('Send the answer code below back to the host.');
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
        attachSyncToChannel(channel, targetGroup, 'joiner');
        channel.addEventListener('open', () => {
          setStatus('Connected. Syncing…');
          setConnectedGroupId(targetGroup);
          setMode('connected');
        });
      });
    } catch (err) {
      joinStartedRef.current = false;
      setError(`Couldn't read offer: ${String((err as Error).message ?? err)}`);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard?.writeText(text);
      setStatus('Copied to clipboard.');
    } catch (err) {
      setError(`Couldn't copy: ${String((err as Error).message ?? err)}`);
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
              Pairing exchanges two short codes between the two phones. Both phones must be on the
              same WiFi when you tap the buttons. After pairing, sync runs over your local network —
              no servers involved.
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
                fullWidth
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
                Paste the host&apos;s offer code on this device.
              </p>
              <Button className="mt-3" fullWidth onClick={() => setMode('join')}>
                I have an offer to paste
              </Button>
            </div>
          </>
        )}

        {mode === 'host' && (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold">Step 1 — Send this offer to your partner</h3>
              {offerPayload ? (
                <>
                  <textarea
                    readOnly
                    rows={5}
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-slate-50 p-2 font-mono text-[10px]"
                    value={offerPayload}
                    data-testid="pair-offer-payload"
                  />
                  <Button
                    className="mt-2"
                    fullWidth
                    variant="secondary"
                    onClick={() => copy(offerPayload)}
                  >
                    Copy offer code
                  </Button>
                </>
              ) : (
                <p className="mt-2 text-xs text-slate-500">Building offer…</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold">Step 2 — Paste your partner&apos;s answer</h3>
              <textarea
                rows={5}
                placeholder="Paste the answer code your partner sends you…"
                value={answerInput}
                onChange={(e) => setAnswerInput(e.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-2 font-mono text-[10px]"
                data-testid="pair-answer-input"
              />
              <Button
                className="mt-2"
                fullWidth
                onClick={() => void acceptAnswer(answerInput)}
                disabled={!answerInput.trim() || answerAppliedRef.current}
              >
                Accept pasted answer
              </Button>
            </div>
          </>
        )}

        {mode === 'join' && (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold">Step 1 — Paste the host&apos;s offer</h3>
              <textarea
                rows={5}
                placeholder="Paste the offer code from the host…"
                value={offerInput}
                onChange={(e) => setOfferInput(e.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-2 font-mono text-[10px]"
                data-testid="pair-offer-input"
              />
              <Button
                className="mt-2"
                fullWidth
                onClick={() => void startJoin(offerInput)}
                disabled={!offerInput.trim() || joinStartedRef.current}
              >
                Generate answer
              </Button>
            </div>

            {answerPayload && (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold">
                  Step 2 — Send this answer back to the host
                </h3>
                <textarea
                  readOnly
                  rows={5}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-slate-50 p-2 font-mono text-[10px]"
                  value={answerPayload}
                  data-testid="pair-answer-payload"
                />
                <Button
                  className="mt-2"
                  fullWidth
                  variant="secondary"
                  onClick={() => copy(answerPayload)}
                >
                  Copy answer code
                </Button>
              </div>
            )}
          </>
        )}

        {mode === 'connected' && <ConnectedPanel groupId={connectedGroupId} />}
      </div>
    </div>
  );
}
