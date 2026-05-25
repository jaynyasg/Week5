import { test, expect } from './fixtures/isolated-env';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.locator('#email').fill('dev@ship.local');
  await page.locator('#password').fill('admin123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL('/login', { timeout: 5000 });
}

test.describe('FleetGraph assistant drawer', () => {
  test('opens a delivered finding, marks it read, records a decision, and answers from context', async ({ page, apiServer }) => {
    await login(page);

    const statusResponse = await page.request.get(`${apiServer.url}/api/fleetgraph/status`);
    expect(statusResponse.ok()).toBe(true);
    await expect.poll(async () => {
      const response = await page.request.get(`${apiServer.url}/api/fleetgraph/status`);
      const status = await response.json();
      return status.available;
    }).toBe(true);

    const findingsResponse = await page.request.get(`${apiServer.url}/api/fleetgraph/findings`);
    expect(findingsResponse.ok()).toBe(true);
    const findingsData = await findingsResponse.json();
    const finding = findingsData.findings.find(
      (item: { title: string }) => item.title === 'Approved plan changed after approval',
    );
    expect(finding, 'FleetGraph E2E seed should create a delivered finding').toBeTruthy();

    await page.goto(`/documents/${finding.targetDocumentId}`);
    await page.getByRole('button', { name: /^Ask Ship/ }).click();
    await page.getByRole('tab', { name: /FleetGraph/ }).click();

    await page.getByRole('button', { name: /Approved plan changed after approval/i }).click();
    await expect(page.getByRole('heading', { name: 'Approved plan changed after approval' })).toBeVisible();
    await expect(page.getByText('Approved plan changed after approval and needs human review.')).toBeVisible();
    await expect(page.getByText(/request update/i)).toBeVisible();

    await expect.poll(async () => {
      const response = await page.request.get(`${apiServer.url}/api/fleetgraph/findings`);
      const data = await response.json();
      const delivery = data.deliveries.find(
        (item: { findingDocumentId: string }) => item.findingDocumentId === finding.id,
      );
      return delivery?.status;
    }).toBe('read');

    await page.getByLabel('FleetGraph action decision note').fill('Covered by the E2E approval gate.');
    await page.getByRole('button', { name: 'Reject' }).click();
    await expect(page.getByText('rejected').first()).toBeVisible();

    await page.getByRole('textbox', { name: 'FleetGraph message' }).fill('What should I look at next?');
    await page.getByRole('button', { name: 'Send FleetGraph message' }).click();
    await expect(page.getByText(/FleetGraph checked .* Ship records/)).toBeVisible();
  });
});
