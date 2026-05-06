# ADR-0002 — WebRTC transport: custom thin transport

## Status

Accepted (2026-05-06)

## Context

We need to sync Yjs updates between two paired devices on the same LAN, **without any signaling server**. The Yjs ecosystem provides `y-webrtc`, but it depends on a public WebSocket signaling server (default `signaling.yjs.dev`) for peer discovery. That violates PrivShare's "no internet ever after install" principle.

Options:

1. Use `y-webrtc` with a self-hosted signaling server.
2. Use `y-webrtc` with a hacked-around signaling layer.
3. Hand-roll a thin WebRTC transport with our own SDP-as-QR signaling.

## Decision

Hand-roll the transport. One `RTCPeerConnection` + one `RTCDataChannel` per peer. SDP exchanged as animated QR codes (see PLAN.md §4.5). Yjs updates flow over the channel using `Y.encodeStateAsUpdate` / `Y.applyUpdate`.

## Why not (1) or (2)

- (1) Self-hosted signaling adds infrastructure we explicitly don't want, and doesn't help privacy if the signaling server is reachable from the internet.
- (2) Hacking around `y-webrtc`'s room-name + central-signaling assumption is more work than writing a small purpose-built transport, and leaves us depending on internals that change.
- `y-webrtc`'s mesh model assumes shared rooms — we instead want explicit, user-authorized pairwise pairing.

## Consequences

**What we own**

- ~200 lines of transport code:
  - Pair: open peer connection, exchange offer/answer, open data channel.
  - Sync: exchange Yjs state vectors, send diffs, subscribe to local doc updates.
  - Heartbeat: 15s ping/pong; on miss, mark peer offline.

**What we get**

- Full control over framing, authentication (Ed25519 signatures on hello messages), and reconnect semantics.
- No dependency on any public service.
- Smaller code surface to audit.

**What we lose**

- The "free" presence/awareness layer that `y-webrtc` ships. We add awareness in v2 if needed.

**Reversibility**: medium. The transport is encapsulated; swapping it for `y-webrtc` later is mechanical if the privacy stance ever relaxes (it won't).
