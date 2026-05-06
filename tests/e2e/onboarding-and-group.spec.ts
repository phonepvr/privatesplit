import { test, expect } from '@playwright/test';

test.describe('onboarding and group flow', () => {
  test('user onboards, creates a group, adds an expense, sees a balance', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Your name').fill('Alex');
    await page.getByRole('button', { name: 'Get started' }).click();

    await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible();
    await page.getByRole('button', { name: '+ New' }).click();
    await page.getByLabel('Group name').fill('Goa Trip');
    await page.getByLabel('Who do you split with?').fill('Priya');
    await page.getByRole('button', { name: 'Create' }).click();

    // Group detail loads
    await expect(page.getByRole('heading', { name: 'Goa Trip' })).toBeVisible();
    await expect(page.getByText('All settled.')).toBeVisible();

    // Add an expense
    await page.getByRole('button', { name: '+ Add expense' }).click();
    await page.getByLabel('Description').fill('Dinner');
    await page.getByLabel(/Amount/).fill('1000');
    await page.getByRole('button', { name: 'Add expense' }).click();

    // Balance line updates to "Priya owes you ₹500.00"
    await expect(page.getByText(/Priya owes you/)).toBeVisible();
  });
});
