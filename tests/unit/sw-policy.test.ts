import { describe, it, expect } from 'vitest';
import { classifyRequest } from '../../src/core/pwa/sw-policy';

const SAME_ORIGIN = 'https://phonepvr.github.io';

describe('classifyRequest', () => {
  it('allows same-origin requests', () => {
    expect(classifyRequest('https://phonepvr.github.io/privatesplit/', SAME_ORIGIN)).toBe('allow');
    expect(
      classifyRequest('https://phonepvr.github.io/privatesplit/assets/main.js', SAME_ORIGIN)
    ).toBe('allow');
    expect(classifyRequest('https://phonepvr.github.io/anything', SAME_ORIGIN)).toBe('allow');
  });

  it('blocks cross-origin HTTPS requests', () => {
    expect(classifyRequest('https://example.com/', SAME_ORIGIN)).toBe('block');
    expect(classifyRequest('https://api.openai.com/v1/chat', SAME_ORIGIN)).toBe('block');
    expect(classifyRequest('https://www.google-analytics.com/g/collect', SAME_ORIGIN)).toBe(
      'block'
    );
    expect(classifyRequest('https://signaling.yjs.dev/', SAME_ORIGIN)).toBe('block');
  });

  it('blocks cross-origin HTTP requests', () => {
    expect(classifyRequest('http://localhost:3000/', SAME_ORIGIN)).toBe('block');
  });

  it('blocks subdomain requests (still cross-origin)', () => {
    expect(classifyRequest('https://other.github.io/', SAME_ORIGIN)).toBe('block');
    expect(classifyRequest('https://api.phonepvr.github.io/', SAME_ORIGIN)).toBe('block');
  });

  it('blocks different protocols on the same host', () => {
    expect(classifyRequest('http://phonepvr.github.io/privatesplit/', SAME_ORIGIN)).toBe('block');
  });

  it('passes through extension-scheme requests', () => {
    expect(classifyRequest('chrome-extension://abc/main.js', SAME_ORIGIN)).toBe('pass-through');
    expect(classifyRequest('moz-extension://xyz/page.html', SAME_ORIGIN)).toBe('pass-through');
    expect(classifyRequest('devtools://devtools/bundled/inspector.html', SAME_ORIGIN)).toBe(
      'pass-through'
    );
  });

  it('blocks data: URLs (treated as cross-origin)', () => {
    // url.origin for data: URLs is "null"; not same-origin to our host.
    expect(classifyRequest('data:text/plain,hello', SAME_ORIGIN)).toBe('block');
  });

  it('handles localhost dev origin correctly', () => {
    const devOrigin = 'http://localhost:5173';
    expect(classifyRequest('http://localhost:5173/privatesplit/', devOrigin)).toBe('allow');
    expect(classifyRequest('http://127.0.0.1:5173/privatesplit/', devOrigin)).toBe('block');
  });

  it('allows requests under the deployed base path', () => {
    expect(
      classifyRequest('https://phonepvr.github.io/privatesplit/manifest.webmanifest', SAME_ORIGIN)
    ).toBe('allow');
    expect(classifyRequest('https://phonepvr.github.io/privatesplit/icon.svg', SAME_ORIGIN)).toBe(
      'allow'
    );
  });
});
