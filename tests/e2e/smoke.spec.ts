import { test, expect } from '@playwright/test';

test('onboarding screen renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'PrivShare' })).toBeVisible();
  await expect(page.getByText(/Local-first expense splitter/)).toBeVisible();
});

test('manifest is reachable', async ({ page, baseURL }) => {
  const res = await page.request.get(`${baseURL}manifest.webmanifest`);
  expect(res.status()).toBe(200);
  const json = await res.json();
  expect(json.name).toBe('PrivShare');
});
