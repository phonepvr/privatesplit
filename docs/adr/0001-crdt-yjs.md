# ADR-0001 — CRDT: Yjs

## Status

Accepted (2026-05-06)

## Context

PrivShare is a local-first PWA where two devices can edit the same group's expense ledger offline and converge on reconnect. We need a CRDT library that:

- Runs in the browser
- Persists to IndexedDB
- Sends incremental updates over a WebRTC DataChannel
- Provides convergent merging without manual conflict resolution
- Stays small enough to ship in a PWA installed on phones

Realistic candidates: **Yjs** and **Automerge 2**.

## Decision

Use **Yjs** (`yjs` + `y-indexeddb`). One `Y.Doc` per group, persisted via `y-indexeddb`, synced over a custom RTCDataChannel transport (see [ADR-0002](./0002-webrtc-custom.md)).

## Why not Automerge 2

- Roughly 3× larger bundle (~80 KB gz vs ~30 KB gz). Bundle size matters for first-load on a phone.
- Heavier runtime (WASM); more variance across mobile browsers.
- The "JSON-shaped doc" feature we'd benefit from isn't needed — our model is a flat ledger of expenses, members, and settlements that maps cleanly to `Y.Map` / `Y.Array`.
- Less mature browser-side ecosystem (no canonical IndexedDB adapter on par with `y-indexeddb`).

## Consequences

**What we get**

- Per-field LWW on `Y.Map` (good enough for v1 expense edits — we keep an explicit edit history alongside).
- State-vector-based incremental sync: send only the bytes the other side is missing.
- Mature browser persistence via `y-indexeddb`.
- A small, audit-friendly dependency footprint.

**What we accept**

- Yjs's history is opaque; we maintain an explicit per-field audit trail (`history` array on each expense) for the "who changed what" UI.
- Yjs documents grow with edit history; we add periodic compaction (see PLAN.md §8.8).
- We give up Automerge's deeper-tree merge expressiveness — not needed for a flat ledger.

**Reversibility**: high cost. Switching CRDTs after data exists in the wild requires a one-time migration export. Treat this as a long-lived choice.
