// Pure request-classification policy used by the service worker to enforce
// PrivShare's "no internet ever after install" promise. The same logic is
// mirrored in `public/service-worker.js`; keep them in sync until the SW gets
// its own TypeScript build pipeline (M7).

export const ALLOWED_NON_HTTP_SCHEMES = [
  'chrome-extension:',
  'moz-extension:',
  'devtools:',
] as const;

export type RequestDecision = 'pass-through' | 'block' | 'allow';

export function classifyRequest(requestUrl: string, swOrigin: string): RequestDecision {
  const url = new URL(requestUrl);
  if ((ALLOWED_NON_HTTP_SCHEMES as readonly string[]).includes(url.protocol)) {
    return 'pass-through';
  }
  if (url.origin !== swOrigin) {
    return 'block';
  }
  return 'allow';
}
