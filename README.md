# PrivShare

Local-first, privacy-respecting two-person expense splitter. PWA. No servers. No internet
calls after install. Direct device-to-device sync over LAN via WebRTC.

> **What this is for me, six months from now:** an operating manual. The plan and rationale
> live in [`PLAN.md`](./PLAN.md); architecture decisions in [`docs/adr/`](./docs/adr/).

## Daily use

1. Open the app on your phone (installed from the Pages URL).
2. Add an expense from the active group's `+ Add expense` button.
3. The single net-balance line at the top of the group reflects the new state.

For sync, both phones need to be open at the same time on the same WiFi. After the first
pairing the partner's device shows up under **Profile → Sync** with a `Reconnect` button.

## What's local, what's shared

- **Local-only**: your name, your device keypair, the diagnostics log.
- **Per-group, shared with peers paired to that group**: meta (name, currency), members,
  expenses, settlements. Data is held in a Yjs CRDT document persisted to IndexedDB and
  exchanged over a direct WebRTC DataChannel.

## Privacy guarantees

After install, the service worker (`public/service-worker.js`) blocks every non-same-origin
fetch with HTTP 599. Verify in two ways:

1. DevTools → Console: `await fetch('https://example.com')` → status 599.
2. `npm run test:e2e` → `service-worker-blocks-internet.spec.ts` asserts the same.

Pairing exchanges WebRTC SDP offer/answer locally (animated QR or copy-paste). There is no
signaling server. The transport is direct LAN, encrypted at the DataChannel layer (DTLS).

## Develop in Codespaces

```bash
npm install
npm run dev          # http://localhost:5173/privatesplit/
npm run test         # 50+ unit tests (Vitest, fast-check)
npm run test:e2e     # end-to-end (Playwright)
npm run typecheck    # strict TS
npm run lint
npm run build        # production bundle in dist/
```

## Deployment

Pushes to `main` (or this feature branch) trigger `.github/workflows/deploy.yml`, which
type-checks, lints, tests, builds, and publishes `dist/` to GitHub Pages at
https://phonepvr.github.io/privatesplit/.

The first deploy needs **Settings → Pages → Source = GitHub Actions** in the repo UI.

## Backup and migration

- **One-tap CSV** per group from the group's `⋯` menu.
- **`.privshare` export** is a signed Yjs snapshot (group meta + members + expenses +
  settlements). Send it via any messenger; import in the new device's **Profile → Backup &
  restore** screen. CRDT semantics merge concurrent edits automatically.

## Known limitations (v1)

- **Android Chrome only.** Other browsers should work but aren't tested in v1.
- **Auto-reconnect requires both apps open.** A closed PWA can't be woken without a
  signaling server. M6 surfaces this honestly.
- **Encryption at rest is not implemented in v1.** Your IndexedDB is plaintext on a trusted
  device; full-disk encryption is your line of defense. Encryption-at-rest is a v2 concern.
- **M5 share-code pairing is deferred to v2.** Use `.privshare` export/import for the
  rare new-device-not-on-our-WiFi case.

## License

MIT — see [`LICENSE`](./LICENSE).
