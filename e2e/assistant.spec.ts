import { expect, test } from './fixtures/isolated-env';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.locator('#email').fill('dev@ship.local');
  await page.locator('#password').fill('admin123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL('/login', { timeout: 5000 });
}

test.describe('Ask Ship assistant', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('opens from the rail and answers with a Ship citation', async ({ page }) => {
    await page.goto('/docs');

    await page.getByRole('button', { name: 'Ask Ship' }).click();
    const panel = page.getByRole('dialog', { name: 'Ask Ship' });
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Ready')).toBeVisible({ timeout: 10000 });

    await panel.getByRole('textbox', { name: 'Ask Ship message' }).fill('What are the Ship project goals?');
    await panel.getByRole('button', { name: 'Send Ask Ship message' }).click();

    await expect(panel.getByText(/Based on the available Ship context/)).toBeVisible({ timeout: 15000 });
    await expect(panel.getByText('Project Overview')).toBeVisible();
  });

  test('indexes an uploaded document from the panel and cites it in an answer', async ({ page }) => {
    await page.goto('/docs');
    await page.getByRole('button', { name: 'New Document', exact: true }).click();
    await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/, { timeout: 10000 });

    await page.getByPlaceholder('Untitled').fill('Assistant Upload E2E');
    await page.waitForResponse((response) => (
      response.url().includes('/api/documents/') &&
      response.request().method() === 'PATCH'
    ));

    await page.getByRole('button', { name: 'Ask Ship' }).click();
    const panel = page.getByRole('dialog', { name: 'Ask Ship' });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Upload Doc' })).toBeVisible({ timeout: 10000 });

    await panel.locator('input[type="file"]').setInputFiles({
      name: 'nebula-brief.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('Project Nebula depends on audit evidence and Render verification.'),
    });

    await expect(panel.getByText('Indexed')).toBeVisible({ timeout: 15000 });

    await panel.getByRole('textbox', { name: 'Ask Ship message' }).fill('What does Project Nebula depend on?');
    await panel.getByRole('button', { name: 'Send Ask Ship message' }).click();

    await expect(panel.getByText(/Based on the available Ship context/)).toBeVisible({ timeout: 15000 });
    await expect(panel.getByRole('link', { name: /nebula-brief\.md/ })).toBeVisible();
  });
});
