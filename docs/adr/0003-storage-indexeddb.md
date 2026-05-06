# ADR-0003 — Local storage: IndexedDB (Dexie + y-indexeddb)

## Status

Accepted (2026-05-06)

## Context

PrivShare stores all data on-device. We need:

- Indexed, queryable structured data (expenses by group, by date, by category) — for fast UI rendering.
- Append-only Yjs document persistence (one doc per group).
- Reasonable quota and persistence durability on mobile browsers.

Candidates: **IndexedDB** and **OPFS** (Origin Private File System).

## Decision

Use **IndexedDB** for both:

- **Dexie** wraps queryable tables (groups, members cache, expenses cache, settlements cache, peers, audit log).
- **`y-indexeddb`** persists each group's `Y.Doc`.

Request `navigator.storage.persist()` on first launch to reduce eviction risk.

## Why not OPFS

- Not universally supported on mobile (varies by browser version) and the persistence semantics differ.
- No mature Yjs adapter for OPFS; we'd be writing one.
- Our v1 data is small structured records, not large binary blobs — OPFS's perf advantage doesn't apply.
- Re-evaluable in v2 if we add receipts (binary attachments) — at which point OPFS is a strong fit additively, not as a replacement.

## Consequences

**What we get**

- Mature ecosystem: Dexie, `y-indexeddb`, schema migrations, indexed queries.
- Plenty of quota for years of household expenses.
- Async API; we treat persistence writes as fire-and-forget after Yjs has acknowledged them in-memory.

**What we accept**

- Safari's quota is more conservative (~1 GB) and evicts under storage pressure. Mitigated by `navigator.storage.persist()` and periodic Yjs compaction (PLAN.md §8.8). v1 ships Android-only so this is mainly a future concern.
- IDB schema migrations are async; we run them at boot before hydration.

**Reversibility**: medium-high cost. Migrating storage backends with live data is a one-time export/import dance.
