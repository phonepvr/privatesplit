import { test, expect } from '@playwright/test';

test('home page renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Hello PrivShare' })).toBeVisible();
});

test('manifest is reachable', async ({ page, baseURL }) => {
  const res = await page.request.get(`${baseURL}manifest.webmanifest`);
  expect(res.status()).toBe(200);
  const json = await res.json();
  expect(json.name).toBe('PrivShare');
});
