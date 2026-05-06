import { useUi } from '../../stores/ui-store';

const SW_PATH = `${import.meta.env.BASE_URL}service-worker.js`;

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) {
    console.warn('[PrivShare] Service workers not supported in this browser.');
    return;
  }

  if (import.meta.env.DEV && import.meta.env.VITE_DISABLE_SW === '1') {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(SW_PATH, { scope: import.meta.env.BASE_URL })
      .then((reg) => {
        if (reg.waiting) useUi.getState().setSwUpdateAvailable(true);
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              useUi.getState().setSwUpdateAvailable(true);
            }
          });
        });
      })
      .catch((err) => {
        console.error('[PrivShare] Service worker registration failed', err);
      });

    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'sw:cross-origin-blocked') {
        console.error('[PrivShare] Cross-origin fetch blocked by SW:', event.data.url);
      }
    });
  });
}
