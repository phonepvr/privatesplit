/* PrivShare service worker — M0 baseline.
 * Enforces the "no internet ever after install" promise by blocking any
 * non-same-origin fetch with HTTP 599 ("Cross-Origin Blocked"). Pre-caching of
 * app assets is added in M7. Keep classification logic in sync with
 * src/core/pwa/sw-policy.ts. */

const SW_VERSION = '0.1.0-m7';
const ALLOWED_NON_HTTP_SCHEMES = ['chrome-extension:', 'moz-extension:', 'devtools:'];

function classifyRequest(requestUrl, swOrigin) {
  const url = new URL(requestUrl);
  if (ALLOWED_NON_HTTP_SCHEMES.includes(url.protocol)) return 'pass-through';
  if (url.origin !== swOrigin) return 'block';
  return 'allow';
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  let decision;
  try {
    decision = classifyRequest(event.request.url, self.location.origin);
  } catch {
    return;
  }

  if (decision === 'pass-through' || decision === 'allow') return;

  console.error('[PrivShare SW] Blocked cross-origin fetch:', event.request.url);

  event.respondWith(
    new Response(
      JSON.stringify({
        error: 'cross-origin-fetch-blocked',
        message: 'PrivShare blocks all non-same-origin network calls.',
        url: event.request.url,
        swVersion: SW_VERSION,
      }),
      {
        status: 599,
        statusText: 'Cross-Origin Blocked',
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  );

  self.clients.matchAll().then((clients) => {
    clients.forEach((client) =>
      client.postMessage({
        type: 'sw:cross-origin-blocked',
        url: event.request.url,
        timestamp: Date.now(),
      })
    );
  });
});
