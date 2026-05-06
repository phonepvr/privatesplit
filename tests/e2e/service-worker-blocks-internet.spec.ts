import { test, expect } from '@playwright/test';

async function waitForActiveSW(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.ready;
      return reg.active?.state === 'activated';
    },
    null,
    { timeout: 10_000 }
  );
}

test.describe('Service worker', () => {
  test('blocks cross-origin fetch with status 599', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Hello PrivShare' })).toBeVisible();
    await waitForActiveSW(page);

    // The first navigation may not have flowed through the SW; reload so this page is SW-controlled.
    await page.reload();
    await waitForActiveSW(page);

    const result = await page.evaluate(async () => {
      try {
        const res = await fetch('https://example.com/');
        return { status: res.status, statusText: res.statusText };
      } catch (err) {
        return { error: String(err) };
      }
    });

    expect(result, 'Cross-origin fetch should be blocked by the SW with 599').toMatchObject({
      status: 599,
      statusText: 'Cross-Origin Blocked',
    });
  });

  test('allows same-origin fetch', async ({ page }) => {
    await page.goto('/');
    await waitForActiveSW(page);
    await page.reload();
    await waitForActiveSW(page);

    const result = await page.evaluate(async () => {
      try {
        const res = await fetch('./manifest.webmanifest');
        return { status: res.status, ok: res.ok };
      } catch (err) {
        return { error: String(err) };
      }
    });

    expect(result).toMatchObject({ status: 200, ok: true });
  });
});
