# PrivShare — Implementation Plan

> **Status:** Draft v1. Awaiting your review and approval before any code is written.
> **Branch:** `claude/privshare-planning-HU3XW`
> **Repo:** `phonepvr/privatesplit`

---

## 0. Naming

The brief calls it **PrivShare** as a working name. The repo is `privatesplit`. A few alternatives that fit the repo and the privacy theme:

| Name                    | Why it might work                                  | Why it might not                          |
| ----------------------- | -------------------------------------------------- | ----------------------------------------- |
| **PrivShare** (default) | Matches the brief; says what it does               | A bit generic                             |
| **PrivateSplit**        | Matches repo name exactly                          | Long; "Private" feels defensive           |
| **Splitless**           | "Wireless/paperless" pun lands the no-server angle | Slightly clever                           |
| **Halve**               | Short, friendly, owns a verb                       | Not obviously about money                 |
| **Tally**               | Evokes a shared paper ledger                       | Slightly generic; an unrelated app exists |

**Recommendation:** Stick with `PrivShare` for v1 unless you say otherwise. Doesn't block M0.

---

## 1. Problem, restated in my words

We're building a PWA that does the standard expense-splitter core loop — groups, members, expenses, splits, balances, settle-up — under a hard rule: no expense data ever touches a server. Ours or anyone else's. The app installs once from GitHub Pages and runs from local storage forever after. Two paired devices on the same WiFi sync over a direct WebRTC DataChannel. Pairing exchanges the WebRTC SDP offer/answer as an animated QR code — no signaling server. Yjs handles convergence; integer-paise math handles money correctness; a strict service worker enforces the "no internet" promise.

The genuinely hard parts:

1. Signaling-server-less WebRTC pairing that a partner can complete in under a minute, once.
2. Deterministic money math with explicit remainder distribution.
3. A service worker that fails loudly on any cross-origin fetch (and a test that proves it).
4. Honest, plain-language UX around what "auto-reconnect" can and cannot do without any discovery server.

Everything else is conventional React/TypeScript app work.

### 1.1 Audience and scale assumptions

- **Two-person closed group** (couple/household), **all Android phones**. This is the v1 target.
- Multiple groups still supported as expense categories (Goa Trip, Apartment, Family); each group's typical N is 2.
- The data model stays N-flexible (groups can technically have more members) but the UI is optimized for N=2.
- This is **not a public product**. We don't optimize for stranger pairing, abuse prevention, or many-new-people scale-out.
- These assumptions shape: M2 (no simplified-debts UI), M4 (Android-only QR primary), M5 (deferred to v2), M7 (README as operating manual), §8 (drop iOS Safari risks), §10 (browser matrix narrows to Android Chrome).

---

## 2. Open questions (need your call before M0/M1)

Numbered so you can answer inline.

1. **GitHub Pages base path.** Repo is `phonepvr/privatesplit`. Default deployment URL would be `https://phonepvr.github.io/privatesplit/`. Vite's `base` and the service worker scope must match. Do you have a custom domain (e.g., a CNAME) or will we ship to that subpath? **Default if you don't reply: `/privatesplit/`.**

2. ~~**iOS Safari priority.**~~ **Resolved (you confirmed):** out of scope for v1 — Android only. This drops the iOS-fallback framing of share-code, removes risk §8.1, and shapes M4/M5 below.

3. **Member ↔ device claim model.** A "member" is a name (a person). A "device" is a physical device with an Ed25519 keypair. The model: anyone can be added to a group by name before they install the app; later, when their device pairs in, that device "claims" the existing member entry. **Confirm or push back.**

4. **Per-group vs per-device pairing.** When Alice pairs with Bob, are they paired (a) at the device level (so future groups they share need only an "invite Bob" action), or (b) per group (re-pair for each new shared group)? **Recommendation: (a) — pair once, then "invite Bob to Group X" sends the group key over the existing/restored channel. M4 will ship (b) as the simpler primitive; (a) is a small extension in M5/M6.**

5. **Trash retention.** Brief says "deleted expenses go to a trash that can be restored within the same session." Strict reading: trash empties on app close. I think you mean: trash persists in storage; "session" was loose phrasing. **Recommendation: trash persists across sessions; user can manually permanently-delete or empty trash; deleted items are excluded from balance computations. Confirm.**

6. **Default currency.** Brief uses paise as the example minor unit. Is INR the default for new groups, with the user able to pick from a list per group? Or auto-detect from `navigator.language`? **Recommendation: INR default, picker per group, list of common currencies (INR, USD, EUR, GBP, AED, SGD, JPY, AUD, CAD).**

7. **Activity tab content.** Bottom-nav has Activity. What goes there? **Recommendation: a flat reverse-chronological feed of expenses + settlements across all groups, with quick filters (group, person). No social-style "Bob added an expense" notifications — those are out of scope for v1.**

8. **Avatar storage.** "Optional avatar" — is this a small image upload (stored as a base64 data URL in IndexedDB) or just a colored initial circle? **Recommendation: just initials with deterministic background color in v1. Image upload is v2 (it grows IndexedDB, complicates export, and pulls in image-handling code).**

9. **PWA update behavior.** When you push a new build, an installed PWA may keep serving the old version. **Recommendation: show a non-blocking "Update available — tap to restart" banner when a new SW is waiting; never auto-reload mid-session because that would interrupt expense entry.**

10. **Telemetry-style debug logs.** Even with no internet, do you want a local "debug log" tab (errors, sync events) for troubleshooting? **Recommendation: yes, a Settings → Diagnostics screen with rolling in-memory logs, exportable as a `.txt`. Helps when something goes wrong in the wild.**

---

## 3. Architecture Decision Records

Three ADRs the brief asked for. I'll commit them as separate files under `docs/adr/` in M0; reproducing the substance here so you can challenge the reasoning.

### ADR-0001 — CRDT: **Yjs** (over Automerge)

**Decision:** Yjs.

**Reasoning:**

- Smaller bundle (Yjs core ~30KB gz; Automerge 2 ~80KB gz with WASM). Bundle size matters for a PWA people install on phones.
- Battle-tested in browsers (Notion-clones, drawing apps, Google-Docs-clones).
- Y.Map / Y.Array models the brief's data model 1:1 (group meta as Y.Map, expenses as Y.Array of Y.Map).
- `y-indexeddb` adapter is mature and exactly what we need.
- Update format is binary, compact, and supports state-vector-based incremental sync — perfect for a one-shot WebRTC handshake that exchanges only what the other side is missing.
- Yjs awareness protocol (presence) is separate from the doc, so we can ignore it in v1 and add it in v2 without churning the data layer.

**Why not Automerge 2:** cleaner JSON-like API but heavier, and the Yjs ecosystem (especially y-indexeddb) is more aligned with our exact use case.

**Tradeoffs accepted:**

- Yjs's edit history is opaque; if we want a per-field edit history UI ("who changed what"), we maintain it explicitly as a parallel Y.Array of audit events.
- Less expressive deep-tree merging than Automerge — fine for a flat-ish ledger.

### ADR-0002 — WebRTC transport: **custom thin transport** (over `y-webrtc`)

**Decision:** Hand-rolled `RTCPeerConnection` + single `RTCDataChannel` per peer, with our own SDP-via-QR/share-code signaling. Yjs updates flow over the channel using `Y.encodeStateAsUpdate` / `Y.applyUpdate`.

**Reasoning:**

- `y-webrtc` requires a public WebSocket signaling server (default: `signaling.yjs.dev`). That breaks the "no internet ever" promise on its face. Hosting our own would require infrastructure we explicitly don't want.
- `y-webrtc`'s mesh model assumes a known room name and discovery via the signaling server; we instead want explicit pairwise pairing.
- Our transport surface is small: open a channel, exchange Yjs state vectors, ship updates. ~200 lines of code, no dependency footprint, full control over framing/auth.
- Plays nicely with our pairing UX where the user explicitly authorizes a peer rather than joining a "room."

**What the transport does:**

1. On connect, both sides exchange `{deviceFingerprint, supportedFeatures, signedHello}`.
2. Each side computes its Yjs state vector and sends it.
3. Each side responds with the diff: `Y.encodeStateAsUpdate(doc, remoteStateVector)`.
4. Both apply the diff. Connection is now in sync.
5. Live updates: subscribe to `doc.on('update', ...)` and forward; on receive, `Y.applyUpdate`.
6. Heartbeat ping/pong every 15s. On disconnect, mark the peer as offline; UI shows it.

**Tradeoffs accepted:**

- We re-implement the small bits y-webrtc gives for free. Worth it for the privacy guarantee and code clarity.

### ADR-0003 — Local storage: **IndexedDB** via Dexie + `y-indexeddb` (over OPFS)

**Decision:** IndexedDB. Dexie wraps queryable tables (members, expenses-cache, settlements, groups, peers, audit log). `y-indexeddb` persists each group's Yjs document.

**Reasoning:**

- IndexedDB is universally supported; OPFS is not (Safari got it 2023, but the ecosystem around querying is thin).
- Dexie gives us indexed queries, schema migrations, and a familiar API.
- We don't have large blobs (no images in v1), so OPFS's perf advantages don't apply.
- `y-indexeddb` is the canonical persistence adapter for Yjs and integrates without ceremony.
- Quota: Chrome ≥ several GB, Safari ~1GB but evicts on storage pressure. Plenty for years of a small group's expenses.

**Tradeoffs accepted:**

- Async-only API for IDB; we always treat persistence writes as fire-and-forget after Yjs has acknowledged them in-memory.
- If we ever want OPFS for, say, encrypted blob backup files (v2 receipts), we adopt OPFS additionally — not as a replacement.

---

## 4. Architecture overview

This is the spine of the app. I'm putting it here so the milestones make sense; the same content will live in `docs/architecture.md`.

### 4.1 Layered model

```
┌─────────────────────────────────────────────────────────────┐
│ UI (React + Tailwind + Zustand)                             │
│   pages/, features/, ui/                                    │
├─────────────────────────────────────────────────────────────┤
│ Domain services                                             │
│   money/  splitter, debt simplifier, currency formatting    │
│   crdt/   Yjs doc factory, change subscription              │
│   storage/ Dexie schema, hydration from Yjs                 │
│   sync/   peer manager, transport, signaling encoder        │
│   pairing/ QR codec, key handshake (share-code → v2)        │
│   crypto/ device keys, group keys, fingerprints, sigs       │
├─────────────────────────────────────────────────────────────┤
│ Browser primitives                                          │
│   IndexedDB · WebRTC · Web Crypto · Service Worker · Camera │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Identity model

- On first launch we generate an **Ed25519 keypair** with `crypto.subtle.generateKey({name:'Ed25519'}, true, ['sign','verify'])` and store `{privateKey, publicKey}` in IndexedDB.
- The **device fingerprint** is `base32(sha256(rawPublicKey)).slice(0, 12)` — short enough to display, long enough to be unique.
- The user picks a **display name** ("Alex") at onboarding. This is stored alongside the key. It identifies the human; the fingerprint identifies the device.
- A user may eventually have multiple devices; each device has its own keypair. They look like distinct peers from the network's perspective but are the same human at the UI layer (member entries can be claimed by multiple device fingerprints).

### 4.3 Group model

- Each group has its own **`Y.Doc`** (one CRDT document per group). Persisted via `y-indexeddb` under the doc name `group:<groupId>`.
- A separate Dexie database holds:
  - `groups` (id, name, currency, createdAt, deletedAt)
  - `members_cache`, `expenses_cache`, `settlements_cache` (denormalized projections of the Yjs doc, rebuilt on load and updated on every Yjs event for fast queries)
  - `peers` (deviceFingerprint, displayName, lastSeenAt, trustedAt, sharedGroupIds)
  - `audit_log` (deviceFingerprint, opId, type, ts, sig — an append-only signed action log; redundant with Yjs but useful for the "who changed what" UI and forensic export)
  - `device_identity` (singleton — our keypair + display name)
- Yjs doc shape per group:
  ```ts
  {
    meta: Y.Map; // { name, currency, createdAt, archivedAt? }
    members: Y.Array<Y.Map>; // { id, name, color, claimedBy?: deviceFingerprint, removedAt? }
    expenses: Y.Array<Y.Map>; // see §4.4
    settlements: Y.Array<Y.Map>; // { id, fromMemberId, toMemberId, amountMinor, date, note, deleted, audit }
  }
  ```

### 4.4 Expense shape

```ts
Y.Map {
  id: string                      // ulid
  description: string
  amountMinor: number             // integer, paise/cents
  currency: 'INR' | ...           // matches group currency in v1
  date: 'YYYY-MM-DD'
  category: 'Food'|'Travel'|'Accommodation'|'Shopping'|'Other'
  notes?: string
  paidBy: memberId
  split: Y.Map {
    type: 'equal' | 'exact'
    participants: Y.Array<memberId>          // who's in
    amounts?: Y.Map<memberId, amountMinor>   // for 'exact' only
  }
  createdBy: deviceFingerprint
  createdAt: ISO8601
  updatedAt: ISO8601
  deletedAt?: ISO8601
  history: Y.Array<{ field, before, after, byDevice, at }>  // per-field audit
}
```

Last-write-wins per field is implemented by writing to the Y.Map fields directly; Yjs handles convergence per-field. The `history` array is appended on every edit.

### 4.5 Sync model

- One `Y.Doc` per group. One `RTCDataChannel` per paired peer (multiplexes all shared groups via a small framing header `{groupId, payload}`).
- Pairing flow (M4/M5):
  1. **A** chooses "Pair new device" + selects which group to share.
  2. **A** creates `RTCPeerConnection({iceServers: []})`, creates a DataChannel, sets local description, **waits for ICE gathering complete** (or 3s timeout).
  3. **A** packages the offer: `{v:1, kind:'offer', sdp, deviceFp, displayName, groupInvite:{groupId, groupName, currency, groupKey, memberIdToClaim?}}`. Compresses with `pako` + base64. Renders as animated QR (chunked).
  4. **B** scans/pastes, decodes, creates its own peer connection, sets remote, creates answer, gathers ICE, packages the answer (with B's deviceFp + displayName, and the member-id B chose to claim), shows QR/code.
  5. **A** scans/pastes the answer. DataChannel opens. They exchange Yjs state vectors and reconcile.
  6. Both write each other to the `peers` table (trusted from now on).
- Group-key handling: in v1 we don't separately encrypt at rest. The "groupKey" in the invite is reserved for v2's encryption-at-rest; in v1 it's a 256-bit random ID used as the Yjs doc identifier scoping (so two unrelated groups don't collide if names match), and as an authorization token so peers can't accidentally write to the wrong group.
- **At N=2 the peer manager is single-peer in practice.** The transport is 1:1, no mesh; we keep the abstraction in case a group ever grows beyond two members.
- Auto-reconnect (M6) is honest about its limits — see §8 risk #6.

### 4.6 Service worker

- A custom-written SW (no Workbox in v1; we want every line auditable). Behaviors:
  1. Pre-cache all build assets at install.
  2. On `fetch`, check the request URL:
     - Same-origin → serve from cache, fall back to network (which will fail offline; that's fine).
     - Cross-origin → **respond with a synthetic `Response` of status 599** and **post a message to all clients** so the UI can flag it. Also `console.error` it.
  3. On activate, claim clients and skip waiting only after a banner-driven user confirmation (per Open Question #9).
- Exception: the SW lets `chrome-extension://`, `moz-extension://`, etc. through (devtools).
- **Test:** Playwright test loads the app, calls `fetch('https://example.com')` from the page, expects status 599 and a console error.

---

## 5. Refined milestones with acceptance criteria

Each milestone ends with a concrete review. I'll only proceed to the next once you've signed off.

### M0 — Skeleton, plan, ADRs

**Scope**

- Vite + React 18 + TS + Tailwind + Zustand bootstrapped.
- `service-worker.ts` with the same-origin-only enforcement plus a Vitest unit test (mocks `fetch` and verifies the SW responds 599 to cross-origin) and a Playwright smoke test.
- `docs/adr/0001..0003` committed (matching §3 above).
- GitHub Actions workflow `deploy.yml`: on push to `main`, run lint + typecheck + unit tests + build, deploy `dist/` to GitHub Pages via the official `actions/deploy-pages` action.
- Empty PWA manifest, app icons, install prompt baseline.
- Lint (eslint) + format (prettier) configs committed, with strict-TS settings.
- README seed (the deep README is M7).

**Acceptance criteria — what you'll check**

- [ ] You can open Codespaces, run `npm install && npm run dev`, see "Hello PrivShare" at `localhost:5173`.
- [ ] You can run `npm run test` (Vitest) and `npm run test:e2e` (Playwright).
- [ ] You push to main and within ~3 minutes the site is live at the pages URL.
- [ ] The cross-origin-fetch test passes: a `fetch('https://example.com')` from the running app is blocked by the SW.
- [ ] All three ADRs are committed and read like decisions, not surveys.

### M1 — Local-only single-user app

**Scope**

- Onboarding screen (display name + the one-screen privacy explainer).
- Bottom-nav shell with Groups, Activity, Add (FAB), Profile.
- Create / list / archive / delete groups. **First-group creation prompts "Who do you split with?" and pre-fills Member 1 = you, Member 2 = partner.**
- Add / edit / remove members (name + color avatar). UI is optimized for N=2 but the underlying model does not hard-cap.
- Add / edit / delete expenses with **equal split** only.
- Group detail screen: list of expenses, **single net-balance line** ("You owe Priya ₹420" / "Priya owes you ₹420" / "All settled").
- Yjs + y-indexeddb persistence wired in.
- Dexie cache with hydration on app load.
- Mobile-first layout tested at 380px.

**Out of scope for M1**

- Unequal splits (M2)
- Settlements (M2)
- CSV export (M2)
- File export/import (M3)
- Sync (M4+)

**Acceptance criteria**

- [ ] On a fresh install, onboarding flow takes < 30 seconds.
- [ ] Creating a group with 4 members and 5 expenses produces visually correct balances that I can verify on paper.
- [ ] Force-quit and reopen: data is intact.
- [ ] Lighthouse PWA audit ≥ 90.
- [ ] No `console.error` during normal use.
- [ ] Unit tests for the Dexie hydration path (Yjs → Dexie → UI projection).

### M2 — Money math, unequal splits, settlements, CSV

**Scope**

- Unequal-split editor (per-participant exact amount; live-validates that they sum to the total).
- Settlement entry (member A pays member B amount X on date Y).
- Per-group balance view stays as the M1 single net-balance line for N=2. (For N≥3, the UI falls back to a per-member balance grid — implementation included for correctness, not for v1's primary path.)
- **Simplified-debt algorithm** per the brief, integer minor units, implemented in `core/money/` and fully tested. **Not surfaced in v1 UI** — at N=2 it produces identical output to raw balance, so a toggle would be visual no-op. The algorithm is ready to expose the moment a group exceeds 2 active members.
- CSV export per group (one row per expense + one row per settlement; UTF-8; Excel-friendly).
- ≥ 50 unit tests covering money math:
  - Equal splits with N=2, 3, 4, 5, 7 and remainders that don't divide evenly.
  - Unequal splits where amounts don't sum to total (rejected at entry; tested at the splitter level).
  - Single-member group (no debts).
  - Circular debts (A→B, B→C, C→A) collapse correctly.
  - Zero-balance edge cases.
  - Large amounts near `Number.MAX_SAFE_INTEGER / 100` to verify integer math doesn't drift.
  - Mixed payers across many expenses.
  - Settlement applied → balances move correctly.
  - 1-paise total ÷ 3 people: deterministic remainder distribution (payer or first-listed participant gets the extra).
  - Debt simplifier produces ≤ N-1 transactions for N members.
  - Property-based test (fast-check): for any random expense set, sum of balances is exactly zero.

**Acceptance criteria**

- [ ] You can construct any expense scenario you've ever had in real life and the balances are right.
- [ ] CSV opens in Excel, Numbers, and Google Sheets without manual fixing.
- [ ] Net balance line for a 2-person group always reduces to one of: "you owe X", "X owes you", "all settled."
- [ ] All 50+ tests pass — including simplified-debt tests for N=3, 4, 5 even though that UI isn't shipped, so we know the algorithm is correct when we need it.

### M3 — File export / import (`.privshare`)

> With M5 deferred to v2, `.privshare` is the **v1 mechanism for moving a group to a new device** when LAN-pairing isn't possible (e.g., new phone purchase, partner is in another city). Send the file via any messenger or email; import on the receiving device.

**Scope**

- Export a group as `.privshare`: a single file containing
  - A small JSON header `{format:'privshare', v:1, groupId, groupName, exportedAt, exportedByDevice, schema:{yjsVersion, fields...}}`
  - A base64-encoded `Y.encodeStateAsUpdate(doc)` payload
  - A SHA-256 of the payload + Ed25519 signature by the exporting device key
- Import a `.privshare` file:
  - **New group** mode: creates a new local group from the file (verifies signature, warns if it can't be verified — i.e., unknown device key — but still allows import).
  - **Merge into existing** mode: applies the Yjs update to an existing group's doc; CRDT semantics merge automatically. Warns if group IDs don't match (you're merging a different group's history).
- Settings → Backup & Restore screen.

**Acceptance criteria**

- [ ] Round-trip: export a group, delete it locally, re-import → identical state.
- [ ] Export from Device A → import on Device B (separate browser profile) → both have the same group with no sync.
- [ ] Make divergent edits on A and B, export both, import each into the other → final state on both is identical (CRDT convergence).
- [ ] Tampered-payload import fails signature verification with a clear message.

### M4 — WebRTC pairing via QR code

> Framed in v1 as a one-time **"set up your partner's phone"** event. QR is the unambiguous primary path on Android Chrome PWA. Share-code (M5) is deferred to v2.

**Scope**

- Pairing screen — single QR tab in v1.
- Animated multi-frame QR for SDP (chunking + reassembly with sequence numbers; max ~5 frames at 4 fps).
- Camera-based scanner using `@zxing/browser`.
- The full handshake from §4.5.
- Live sync: edits made on either device propagate within ~1 second while both are open.
- Trust model: after a successful pair, both sides write each other to the `peers` table with `trustedAt`.
- A Playwright E2E test that:
  - Opens two browser contexts (two "devices").
  - Programmatically transfers QR-frame binary payloads from one to the other (simulating a scan), avoiding actual camera mocking.
  - Verifies that an expense added on Context A appears on Context B within 2 seconds.

**Acceptance criteria**

- [ ] Two real devices on the same WiFi pair end-to-end in under 90 seconds (timed).
- [ ] Edits on one show up on the other within 2 seconds.
- [ ] Force-quitting one device and bringing it back: when you re-open the pairing screen and re-scan, history merges correctly with no duplicates.
- [ ] If devices are on different WiFis: pairing fails with a clear "couldn't reach the other device — make sure you're on the same WiFi" message, not a stack trace.
- [ ] No internet calls during pairing (verify in DevTools Network tab — only ws/RTCDataChannel; no HTTP).

### M5 — Share-code pairing (paste-based) — **DEFERRED to v2**

**Why deferred:** at N=2 in a household, both devices are typically reachable on the same WiFi (M4 covers this case). The remote-pairing case ("I'm at the airport with a new phone") is solvable today via M3's `.privshare` export/import sent over any messenger or email. Building the share-code path now adds work for a use case we don't currently have.

**What we save now:** the codec, the chunking logic for share codes, the "this code doesn't contain your data" UX framing, and an E2E test variant.

**What v2 will do, if needed:** the same handshake as M4 encoded as multi-line base64 over messenger/email, reusing the existing peer trust list so re-pairing a known device skips most of the setup.

**Trigger to revisit:** any of (a) you ask for it, (b) we add a third member who isn't on the home WiFi, (c) `.privshare` round-trips become friction in practice.

### M6 — Auto-reconnect (honest version)

> Especially valuable for this use case: a couple opens both apps daily and expects sync to "just work" without re-pairing. Honest scope below — true zero-touch isn't possible from a browser.

**Scope**

- On app open, the app reads `peers` and shows known peers' status: "Last seen here 2 days ago."
- For each known peer, a one-tap "Reconnect" button generates a fresh QR and waits for the other side to scan. The other device, if open, shows a "Reconnect with Alex?" toast that auto-launches its scanner. (Both devices need to be open; we cannot wake a closed PWA.)
- We do **not** claim true zero-touch reconnect — this requires LAN discovery the browser doesn't expose. See §8 risk #6 for a detailed honest description and the few opt-in paths (BroadcastChannel for same-browser, a "tap to reconnect" tray entry).
- Optional: a short-lived "rendezvous" mode where both devices, on the same WiFi, broadcast a hashed group-id over WebRTC mDNS-style hostnames — investigated; if not feasible, dropped from M6 and noted.

**Acceptance criteria**

- [ ] Two previously paired devices on the same WiFi can re-sync in under 15 seconds with at most two taps each.
- [ ] No internet calls during reconnect.
- [ ] If one device is offline, the other shows "Alex's device isn't reachable" — not a hung UI.

### M7 — Polish + production deploy

**Scope**

- PWA install prompt (`beforeinstallprompt`) with our own UI affordance, since stock prompts are dismissed reflexively.
- Offline indicator in the header (always "offline by design" — small green dot reading "Local mode"); separate sync indicator showing peer connection status.
- Edit history viewer per expense.
- Trash bin viewer (deleted expenses) with restore + permanent-delete.
- Settings: display name, device fingerprint, theme (light/system; dark mode is defer-to-v2 unless trivial), data management (export all, import, factory reset with double-confirmation), diagnostics tab (debug log).
- README — **operating-manual style for you, not a stranger-onboarding doc**:
  - What this is, why it exists
  - Privacy guarantees + how to verify (browser DevTools steps)
  - Pairing walkthrough with screenshots
  - Build & deploy instructions (Codespaces-only; no local Node assumed)
  - Known limitations (auto-reconnect honesty; LAN UDP-blocking caveats; iOS not yet tested)
- GitHub Actions polish: lint + typecheck + unit + e2e + build + deploy, with a status badge in README.
- Changelog file.
- License (MIT? Apache 2.0? — flag in PR).

**Acceptance criteria**

- [ ] Lighthouse PWA + Performance + Accessibility ≥ 90 on Android Chrome mobile profile.
- [ ] You can install the PWA on Android Chrome and use it offline.
- [ ] Factory reset wipes all data and re-runs onboarding.
- [ ] README is good enough that you could rebuild the project in a year without re-figuring-it-out.

---

## 6. File / folder structure

```
.
├── .github/
│   └── workflows/
│       ├── deploy.yml              # build + deploy to gh-pages on main
│       └── ci.yml                  # lint + typecheck + tests on every PR
├── docs/
│   ├── adr/
│   │   ├── 0001-crdt-yjs.md
│   │   ├── 0002-webrtc-custom.md
│   │   └── 0003-storage-indexeddb.md
│   ├── architecture.md
│   ├── pairing-protocol.md
│   ├── data-model.md
│   └── threat-model.md
├── public/
│   ├── icons/                      # 192, 384, 512, maskable
│   ├── manifest.webmanifest
│   └── robots.txt                  # disallow all (it's a PWA, not content)
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── routes.tsx
│   │   └── shell/                  # bottom nav, header, layout primitives
│   ├── core/
│   │   ├── crdt/                   # Y.Doc factory, persistence wiring
│   │   ├── crypto/                 # Ed25519, AES-GCM, fingerprint, signing
│   │   ├── money/                  # split, simplifier, format, parse
│   │   ├── storage/                # Dexie schemas, hydration, migrations
│   │   ├── sync/                   # transport, peer manager, framing, sigs
│   │   ├── pairing/                # QR encode/decode, handshake (share-code codec → v2)
│   │   ├── pwa/                    # SW registration, update banner glue
│   │   └── ids/                    # ulid, fingerprint helpers
│   ├── features/
│   │   ├── groups/                 # group list, create, archive
│   │   ├── members/                # add, edit, color picker
│   │   ├── expenses/               # editor, list item, split UI
│   │   ├── settlements/
│   │   ├── balances/               # raw + simplified views
│   │   ├── activity/
│   │   ├── pairing/                # screens
│   │   ├── trash/
│   │   ├── export-import/          # CSV, .privshare
│   │   └── settings/
│   ├── ui/
│   │   ├── components/             # Button, Sheet, Input, Modal, etc.
│   │   ├── icons/
│   │   ├── theme.ts
│   │   └── tokens.css
│   ├── stores/
│   │   ├── ui-store.ts             # nav state, modal state
│   │   └── session-store.ts        # current group, current user, etc.
│   ├── service-worker.ts
│   ├── main.tsx
│   └── index.html
├── tests/
│   ├── unit/                       # Vitest
│   │   ├── money/
│   │   ├── crdt/
│   │   ├── crypto/
│   │   ├── pairing/
│   │   └── service-worker/
│   ├── e2e/                        # Playwright
│   │   ├── onboarding.spec.ts
│   │   ├── single-user-flow.spec.ts
│   │   ├── balances.spec.ts
│   │   ├── pairing-qr.spec.ts
│   │   ├── sync-convergence.spec.ts
│   │   ├── service-worker-blocks-internet.spec.ts
│   │   └── pwa-install-and-offline.spec.ts
│   └── fixtures/
├── scripts/
│   ├── verify-no-runtime-network.ts  # static check: forbid eg. 'https://...' literal in src/
│   └── check-bundle-size.ts
├── .editorconfig
├── .eslintrc.cjs
├── .prettierrc
├── .gitignore
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── PLAN.md                         # this file
├── README.md
├── CHANGELOG.md
└── LICENSE
```

---

## 7. Test strategy summary

| Layer                    | Tooling                | What we test                                                          |
| ------------------------ | ---------------------- | --------------------------------------------------------------------- |
| Money math               | Vitest + fast-check    | Splits, remainders, debt simplification (≥ 50 cases + property tests) |
| CRDT plumbing            | Vitest                 | Yjs doc creation, Dexie hydration, audit log integrity                |
| Crypto                   | Vitest                 | Keypair gen, signing, fingerprint, AES-GCM round-trip                 |
| Pairing codec            | Vitest                 | Offer/answer encode → chunk → reassemble (QR frames)                  |
| Service worker           | Vitest + Playwright    | Same-origin allow, cross-origin block (status 599)                    |
| End-to-end UX            | Playwright             | Onboarding, single-user flows, two-context pairing, sync convergence  |
| Visual regression (lite) | Playwright screenshots | Key screens at 380px and 768px                                        |

CI matrix: Linux only on GitHub Actions, Chromium via Playwright (matches the Android Chrome target). Firefox/WebKit deferred to v2 alongside iOS.

---

## 8. Risks & gotchas

### 8.1 iOS Safari WebRTC quirks — **out of scope in v1**

v1 targets Android Chrome only (per §1.1). iOS support is a v2 concern; if we adopt it, this section returns with mitigations (camera-in-standalone-PWA quirks, mDNS-rewritten ICE candidates, etc.).

### 8.2 SDP-too-large-for-one-QR

- Without TURN, our SDP is ~1–3 KB. Single QR (version 40, binary) holds up to ~2.9 KB raw; with our prefix overhead and gzip we'll usually fit but not reliably.
- **Mitigation:** always animate QR with a 2–6 frame loop. Receiver assembles by frame index. We use a deterministic chunker (`{seq, total, payload}`), not a fountain code, in v1 — fountain is overkill at 6 frames. Animation rate ~3 fps; receiver typically captures all frames within 2s.
- **Compression:** gzip via `pako` before chunking trims SDP by ~50%.

### 8.3 IndexedDB quota limits

- Safari ~1 GB, Chrome much more, Firefox respects quota gracefully. Quota pressure can lead to silent eviction.
- **Mitigation:** call `navigator.storage.persist()` after onboarding to request "persisted" status. Periodically run a Yjs compaction job: read full state, replace with `Y.encodeStateAsUpdate(doc)` as a fresh doc with no history payload. Surface "Storage usage: X MB" in Settings → Diagnostics.

### 8.4 Service worker caching invalidation when you push updates

- Classic problem: installed PWA serves stale assets after new build.
- **Mitigation:** Vite emits content-hashed asset names. SW pre-caches them with a manifest that includes a build timestamp. New SW installs in background; UI shows "Update available" banner; user taps "Restart." We never auto-skip-waiting mid-session because that can interrupt expense entry.

### 8.5 Mixed-content / HTTPS for WebRTC vs LAN peers

- Browsers require a secure context for WebRTC. GitHub Pages serves HTTPS, so this is satisfied for both peers.
- Two peers on the same WiFi each load `https://phonepvr.github.io/privatesplit/` (each over its own HTTPS connection to GitHub). After install, they both run from cached SW. The WebRTC DataChannel is **direct LAN** between them — DTLS-encrypted at the DataChannel layer regardless of TLS. No HTTP request actually traverses the LAN; the DataChannel is its own transport.
- There is no mixed-content concern because we never attempt an `http://` subresource.
- **Caveat:** if a corporate WiFi blocks UDP, the LAN candidates fail. We display "couldn't reach peer" and suggest a hotspot. Document.

### 8.6 "Auto-reconnect" honesty

- True zero-touch reconnect from a closed PWA on the same LAN is **not possible** in browsers without a signaling channel. Browsers don't expose:
  - mDNS service discovery
  - LAN broadcast sockets
  - Background process to listen for incoming connections
- What we CAN offer:
  - Both apps open: store the peer's previous SDP, attempt reuse with `setRemoteDescription` + `restartIce` — not reliable across NATs even on LAN, but worth trying once per session.
  - One-tap re-pair: known peer → "Reconnect" button generates fresh QR/code, the other device shows a "Reconnect with Alex?" prompt the moment its app opens (once it's running).
  - BroadcastChannel works only same-origin same-browser (useless for two devices but useful for two tabs on the same machine — we'll wire it for free).
  - Investigate: a tiny opt-in HTTP fallback over LAN using `RTCPeerConnection`'s ICE gathering against a published `.local` mDNS name written to a QR shown briefly at app open. Probably more trouble than worth; documenting as "tried, didn't ship."
- **Mitigation:** name M6 honestly in the UI. Don't promise magic. Two taps on each device beats a fragile auto-flow that sometimes fails for unclear reasons.

### 8.7 Web Crypto Ed25519 availability

- Ed25519 in Web Crypto is supported in Chromium 113+, Safari 17+, Firefox 130+. For 2026, near-universal.
- **Mitigation:** feature-detect at startup; if missing, show a "Please update your browser" screen. Don't fall back to a JS implementation — the security/correctness review is not worth the 2% of users on EOL browsers.

### 8.8 Yjs document growth

- Yjs preserves per-edit metadata; a long-lived group's doc can grow MB-large.
- **Mitigation:** the periodic compaction job in §8.3 trims to current state. We accept losing CRDT-merge-compatibility with very-old offline replicas after compaction (i.e., a device that's been offline for a year then comes back may need a full re-sync rather than a delta — acceptable).

### 8.9 Clock skew between devices

- `createdAt`, `updatedAt`, `history` all use device-local clocks. Two devices' clocks may differ.
- **Mitigation:** trust `Date.now()` for human-facing timestamps but never rely on them for ordering inside Yjs (Yjs's vector clocks order ops). When showing history, always show the device name + that device's local timestamp; never claim a global ordering.

### 8.10 Member removal vs. balance-preservation

- Removing a member after they've participated in expenses must not erase those expenses or break balances.
- **Mitigation:** "remove" sets `removedAt` on the member; UI hides them from new-expense pickers but keeps showing them in historical expenses with a small "(left group)" badge. Balance computation continues to include them.

### 8.11 GitHub-Pages-only CI/CD (no Mr. X CLI)

- You upload via browser. Every command in our docs must run either in a Codespace or in a workflow.
- **Mitigation:** the deploy workflow runs the entire pipeline; you only need to merge to main to ship. Codespaces is the documented dev environment. README has zero "run this on your laptop" instructions.

---

## 9. What success looks like — per-milestone demo scripts

These are the concrete walkthroughs you'll do in the browser to verify each milestone before approval.

### M0 demo

1. Open the live PWA URL on your phone. See a "Hello PrivShare" screen.
2. Open DevTools → Application → Service Workers. Confirm SW is active.
3. In DevTools console, run `await fetch('https://example.com')`. Expect status 599 and a console error.
4. Open the Actions tab on GitHub. See the green deploy run.

### M1 demo

1. Onboard as "Alex." Read the privacy explainer.
2. Create a group "Goa Trip." Onboarding-from-zero pre-fills Alex; you add Priya as Member 2.
3. Add 5 expenses (e.g., Alex paid 2400 for dinner, equal split; Priya paid 800 for coffee; etc.).
4. Open Group Detail. Verify the single net-balance line matches what you compute on paper.
5. Force-quit the app. Reopen. Data is intact.
6. Toggle airplane mode on. Add another expense. App works normally.

### M2 demo

1. In "Goa Trip," add an unequal expense: ₹1000, paid by Alex; Alex 400, Priya 600.
2. Add a settlement: Priya pays Alex ₹200 cash.
3. Open balance view. Confirm the single net-balance line reflects both events correctly.
4. Export CSV. Open in Google Sheets. Numbers match.
5. Run `npm run test`; see ≥ 50 money tests pass — including N≥3 simplified-debt cases that aren't UI-exposed but are covered by tests.

### M3 demo

1. Export "Goa Trip" as `.privshare`.
2. Delete the group. Verify it's gone.
3. Import the file. Group reappears identically.
4. Simulate "new phone" migration: open in a fresh browser profile (incognito + clear storage). Onboard as "Priya." Import the file. Group appears, attributed to "Alex's device."
5. On both profiles, add divergent expenses while offline. Export both. Cross-import. Final state on both is identical (CRDT convergence verified).

### M4 demo

1. Your Android phone (Alex) and partner's Android phone (Priya), same home WiFi.
2. Phone A: Pair → Show QR. Phone B: Pair → Scan QR.
3. Camera reads animated QR; phone B generates answer; phone A scans phone B's QR.
4. "Paired with Priya" toast on both within 90 seconds.
5. Phone A adds an expense. Phone B sees it within 2 seconds.
6. Confirm DevTools Network tab shows zero HTTP traffic during the entire pairing.

### M5 demo

Deferred to v2. See §5 M5 for the trigger conditions to revisit.

### M6 demo

1. Re-open both phones the next day. Both auto-detect the previously-paired peer.
2. Tap "Reconnect with Priya" on phone A. Phone B shows "Reconnect with Alex?" toast. Tap accept.
3. Within 15 seconds, the apps are syncing again.

### M7 demo

1. Install PWA on both Android phones. Use offline.
2. Walk your partner through the pairing flow once. It works on the first try.
3. Read the README cold. Confirm the privacy model is documented well enough that you'd remember it in six months.

---

## 10. Browser / device support matrix (target for v1)

| Browser                   | Onboarding | Single-user | QR pair | Notes                                                           |
| ------------------------- | :--------: | :---------: | :-----: | --------------------------------------------------------------- |
| Chrome (Android)          |     ✅     |     ✅      |   ✅    | **Primary target — fully tested.**                              |
| Chrome (desktop)          |     ⚠️     |     ⚠️      |    —    | Should work; not tested in v1. Useful for bulk entry if wanted. |
| Other modern browsers     |     ⚠️     |     ⚠️      |    —    | Should work; not tested in v1.                                  |
| iOS Safari                |     —      |      —      |    —    | **Out of scope in v1** (per §1.1). Revisit in v2.               |
| Old browsers (no Ed25519) |     ❌     |      —      |    —    | Show "please update."                                           |

Code-pair column removed since M5 is deferred.

---

## 11. Estimated effort (rough; for your planning, not a commitment)

| Milestone | Effort (sessions)                 |
| --------- | --------------------------------- |
| M0        | 1                                 |
| M1        | 2–3                               |
| M2        | 1.5 (simplified-debts UI dropped) |
| M3        | 1                                 |
| M4        | 3                                 |
| M5        | — (deferred to v2)                |
| M6        | 1–2                               |
| M7        | 1.5–2 (lighter README; no iOS)    |

Total: ~10–12 working sessions. Range reflects WebRTC variance.

---

## 12. What I want from you on this plan

1. Answer the remaining nine Open Questions in §2 (Q#2 is now resolved — Android-only).
2. Push back on any ADR you disagree with (§3) — these are the load-bearing decisions.
3. Approve, modify, or rebalance the milestones (§5), especially the M2 simplified-debts trim and the M5 deferral. I won't write code until you sign off.
4. Tell me whether to ask for confirmation at the end of each milestone, or whether you'd prefer milestones to chain automatically once they pass their acceptance criteria (I default to "ask").
5. If you have more numbered feedback items beyond your "1." (closed-group framing), send them — I'll fold them in the same way before any code is written.

Ready when you are.
