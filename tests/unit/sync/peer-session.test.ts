import { describe, expect, it, beforeEach } from 'vitest';
import {
  closeSession,
  getSession,
  listSessions,
  registerSession,
} from '../../../src/core/sync/peer-session';

// happy-dom doesn't ship a real RTCPeerConnection, so we feed minimal stubs
// that satisfy the manager's ownership semantics.
class FakeChannel {
  readyState: 'connecting' | 'open' | 'closing' | 'closed' = 'open';
  private listeners: Record<string, ((e?: unknown) => void)[]> = {};
  addEventListener(type: string, fn: (e?: unknown) => void): void {
    (this.listeners[type] ??= []).push(fn);
  }
  send(): void {
    /* no-op */
  }
  close(): void {
    this.readyState = 'closed';
    for (const fn of this.listeners.close ?? []) fn();
  }
  fireClose(): void {
    this.close();
  }
}

class FakePc {
  closed = false;
  close(): void {
    this.closed = true;
  }
}

const SESSION_GROUPS = ['m-test-1', 'm-test-2'];

beforeEach(() => {
  for (const id of SESSION_GROUPS) closeSession(id);
});

describe('peer-session manager', () => {
  it('registers and exposes a session', () => {
    const channel = new FakeChannel();
    const pc = new FakePc();
    registerSession({
      groupId: 'm-test-1',
      pc: pc as unknown as RTCPeerConnection,
      channel: channel as unknown as RTCDataChannel,
      role: 'host',
    });
    expect(getSession('m-test-1')?.groupId).toBe('m-test-1');
    expect(listSessions().some((s) => s.groupId === 'm-test-1')).toBe(true);
  });

  it('closes the previous session when a second one registers for the same group', () => {
    const a = new FakeChannel();
    const aPc = new FakePc();
    registerSession({
      groupId: 'm-test-2',
      pc: aPc as unknown as RTCPeerConnection,
      channel: a as unknown as RTCDataChannel,
      role: 'host',
    });
    const b = new FakeChannel();
    const bPc = new FakePc();
    registerSession({
      groupId: 'm-test-2',
      pc: bPc as unknown as RTCPeerConnection,
      channel: b as unknown as RTCDataChannel,
      role: 'joiner',
    });
    expect(aPc.closed).toBe(true);
    expect(getSession('m-test-2')?.role).toBe('joiner');
  });

  it('removes the session when the channel fires close', () => {
    const channel = new FakeChannel();
    const pc = new FakePc();
    registerSession({
      groupId: 'm-test-1',
      pc: pc as unknown as RTCPeerConnection,
      channel: channel as unknown as RTCDataChannel,
      role: 'host',
    });
    expect(getSession('m-test-1')).toBeDefined();
    channel.fireClose();
    expect(getSession('m-test-1')).toBeUndefined();
  });

  it('closeSession is idempotent and clears state', () => {
    const channel = new FakeChannel();
    const pc = new FakePc();
    registerSession({
      groupId: 'm-test-1',
      pc: pc as unknown as RTCPeerConnection,
      channel: channel as unknown as RTCDataChannel,
      role: 'host',
    });
    closeSession('m-test-1');
    closeSession('m-test-1');
    expect(getSession('m-test-1')).toBeUndefined();
    expect(pc.closed).toBe(true);
  });
});
