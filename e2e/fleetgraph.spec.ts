import { test, expect } from './fixtures/isolated-env';
import { spawnSync } from 'child_process';

const PROJECT_ROOT = process.cwd();
const FIVE_MINUTES_MS = 5 * 60 * 1000;

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.locator('#email').fill('dev@ship.local');
  await page.locator('#password').fill('admin123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL('/login', { timeout: 5000 });
}

async function getCsrfToken(page: import('@playwright/test').Page, apiUrl: string): Promise<string> {
  const response = await page.request.get(`${apiUrl}/api/csrf-token`);
  expect(response.ok()).toBe(true);
  const { token } = await response.json();
  return token;
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

  test('delivers a proactive finding from a real document event in under five minutes', async ({ page, apiServer, dbContainer }) => {
    await login(page);
    const csrfToken = await getCsrfToken(page, apiServer.url);

    const meResponse = await page.request.get(`${apiServer.url}/api/auth/me`);
    expect(meResponse.ok()).toBe(true);
    const me = await meResponse.json();
    const userId = me.data.user.id as string;

    const startedAt = Date.now();
    const sprintResponse = await page.request.post(`${apiServer.url}/api/documents`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        title: `FleetGraph Timed Week ${startedAt}`,
        document_type: 'sprint',
        properties: {
          owner_id: userId,
          sprint_status: 'active',
          status: 'active',
        },
      },
    });
    expect(sprintResponse.ok()).toBe(true);
    const sprint = await sprintResponse.json();

    await expect.poll(async () => {
      runFleetGraphDrain(dbContainer.getConnectionUri());

      const findingsResponse = await page.request.get(`${apiServer.url}/api/fleetgraph/findings`);
      expect(findingsResponse.ok()).toBe(true);
      const data = await findingsResponse.json();
      const finding = data.findings.find(
        (item: { targetDocumentId: string | null; kind: string; title: string }) =>
          item.targetDocumentId === sprint.id
          && item.kind === 'planning_gap'
          && item.title.includes('Week plan needs approval'),
      );

      return finding ? 'delivered' : 'waiting';
    }, {
      intervals: [1000, 2000, 5000],
      timeout: 60_000,
    }).toBe('delivered');

    const latencyMs = Date.now() - startedAt;
    expect(latencyMs).toBeLessThan(FIVE_MINUTES_MS);

    await page.goto(`/documents/${sprint.id}`);
    await page.getByRole('button', { name: /^Ask Ship/ }).click();
    await page.getByRole('tab', { name: /FleetGraph/ }).click();
    await expect(page.getByRole('button', { name: /Week plan needs approval/i })).toBeVisible();
  });
});

function runFleetGraphDrain(databaseUrl: string): { processed: number; findingsCreated: number; failures: number } {
  const result = spawnSync(
    process.execPath,
    ['dist/scripts/fleetgraph-drain.js'],
    {
      cwd: `${PROJECT_ROOT}/api`,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        DOTENV_CONFIG_PATH: '/dev/null',
        NODE_ENV: 'test',
        SHIP_FLEETGRAPH_ENABLED: 'true',
        SHIP_FLEETGRAPH_PROVIDER: 'mock',
        SHIP_FLEETGRAPH_MODEL: 'mock-fleetgraph',
        SHIP_FLEETGRAPH_PROACTIVE_ENABLED: 'true',
        SHIP_FLEETGRAPH_TRACING_ENABLED: 'false',
      },
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 30_000,
    },
  );

  expect(result.error, result.stderr || result.stdout).toBeUndefined();
  expect(result.status, result.stderr || result.stdout).toBe(0);
  const line = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  expect(line, result.stdout).toBeTruthy();
  return JSON.parse(line!) as { processed: number; findingsCreated: number; failures: number };
}
