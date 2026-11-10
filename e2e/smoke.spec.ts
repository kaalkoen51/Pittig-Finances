import { expect, test } from '@playwright/test';

// Smoke test for the shell. Feature agents extend e2e/ with the main flow (see PLAN acceptance).
test('app opens on the overview and navigates', async ({ page, isMobile }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await expect(page).toHaveURL(/#\/overview$/);
  if (isMobile) {
    await page.locator('.pf-tabbar').getByRole('link', { name: 'Sales' }).click();
  } else {
    await page.locator('.pf-sidebar').getByRole('link', { name: 'Sales' }).click();
  }
  await expect(page.getByRole('heading', { level: 1, name: 'Sales' })).toBeVisible();
});
