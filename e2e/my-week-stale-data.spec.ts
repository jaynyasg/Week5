import { test, expect } from './fixtures/isolated-env'
import type { Page } from '@playwright/test'

/**
 * Tests that /my-week reflects plan/retro edits after navigating back.
 *
 * Bug: The my-week query had a 5-minute staleTime and content edits go through
 * Yjs WebSocket (no client-side mutation), so navigating back showed stale data.
 * Fix: staleTime set to 0 so every mount refetches fresh data from the API.
 */

async function currentDocumentId(page: Page): Promise<string> {
  const documentId = new URL(page.url()).pathname.match(/\/documents\/([a-f0-9-]+)/i)?.[1]
  if (!documentId) {
    throw new Error('Expected to be on a document page')
  }
  return documentId
}

async function waitForDocumentContent(
  page: Page,
  endpoint: 'weekly-plans' | 'weekly-retros',
  documentId: string,
  expectedText: string
): Promise<void> {
  let lastContent = ''
  const deadline = Date.now() + 30000

  while (Date.now() < deadline) {
    const result = await page.evaluate(
      async ({ endpointName, id }) => {
        const response = await fetch(`/api/${endpointName}/${id}`, { credentials: 'include' })
        if (!response.ok) {
          return { contentText: '', status: response.status }
        }

        const data = await response.json() as { content?: unknown }
        return { contentText: JSON.stringify(data.content ?? ''), status: response.status }
      },
      { endpointName: endpoint, id: documentId }
    )

    lastContent = result.contentText
    if (lastContent.includes(expectedText)) {
      return
    }

    await page.waitForTimeout(500)
  }

  expect(lastContent, `${endpoint}/${documentId} should include persisted editor content`).toContain(expectedText)
}

async function waitForMyWeekItem(page: Page, kind: 'plan' | 'retro', expectedText: string): Promise<void> {
  let lastItems = ''
  const deadline = Date.now() + 30000

  while (Date.now() < deadline) {
    const result = await page.evaluate(async (targetKind) => {
      const response = await fetch('/api/dashboard/my-week', { credentials: 'include' })
      if (!response.ok) {
        return { itemsText: '', status: response.status }
      }

      const data = await response.json() as {
        plan?: { items?: Array<{ text?: string }> } | null
        retro?: { items?: Array<{ text?: string }> } | null
      }
      const target = data[targetKind]
      const itemsText = JSON.stringify((target?.items ?? []).map((item) => item.text ?? ''))
      return { itemsText, status: response.status }
    }, kind)

    lastItems = result.itemsText
    if (lastItems.includes(expectedText)) {
      return
    }

    await page.waitForTimeout(500)
  }

  expect(lastItems, `/api/dashboard/my-week ${kind} items should include persisted editor content`).toContain(expectedText)
}

async function typeNumberedListItem(page: Page, text: string): Promise<void> {
  await page.keyboard.type('1. ')
  await page.waitForTimeout(250)
  await page.keyboard.type(text)
}

test.describe('My Week - stale data after editing plan/retro', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.locator('#email').fill('dev@ship.local')
    await page.locator('#password').fill('admin123')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).not.toHaveURL('/login', { timeout: 5000 })
  })

  test('plan edits are visible on /my-week after navigating back', async ({ page }) => {
    // 1. Navigate to /my-week
    await page.goto('/my-week')
    await expect(page.getByRole('heading', { name: /^Week \d+$/ })).toBeVisible({ timeout: 10000 })

    // 2. Create a plan (click the create button)
    await page.getByRole('button', { name: /create plan for this week/i }).click()

    // 3. Should navigate to the document editor
    await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/, { timeout: 10000 })

    // 4. Wait for the TipTap editor to be ready
    const editor = page.locator('.tiptap')
    await expect(editor).toBeVisible({ timeout: 10000 })

    // 5. Type a list item into the editor
    // Use "1. " prefix to create a numbered list (orderedList with listItem nodes)
    await editor.click()
    await typeNumberedListItem(page, 'Ship the new dashboard feature')

    // 6. Wait for the collaboration server to persist the content
    // The regression lives at the API boundary: /my-week reads from the persisted
    // content column, while the editor writes through Yjs WebSocket persistence.
    const planId = await currentDocumentId(page)
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 10000 })
    await waitForDocumentContent(page, 'weekly-plans', planId, 'Ship the new dashboard feature')
    await waitForMyWeekItem(page, 'plan', 'Ship the new dashboard feature')

    // 7. Navigate back to /my-week using client-side navigation (Dashboard icon in rail)
    await page.getByRole('button', { name: 'Dashboard' }).click()
    await expect(page.getByRole('heading', { name: /^Week \d+$/ })).toBeVisible({ timeout: 10000 })

    // 8. Verify the plan content is visible on the my-week page
    // The my-week API reads from the `content` column which is updated by the
    // collaboration server's persistence layer (async from WebSocket edits)
    await expect(page.getByText('Ship the new dashboard feature')).toBeVisible({ timeout: 15000 })
  })

  test('retro edits are visible on /my-week after navigating back', async ({ page }) => {
    // 1. Navigate to /my-week
    await page.goto('/my-week')
    await expect(page.getByRole('heading', { name: /^Week \d+$/ })).toBeVisible({ timeout: 10000 })

    // 2. Create a retro (click the main create button, not the nudge link)
    await page.getByRole('button', { name: /create retro for this week/i }).click()

    // 3. Should navigate to the document editor
    await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/, { timeout: 10000 })

    // 4. Wait for the TipTap editor to be ready
    const editor = page.locator('.tiptap')
    await expect(editor).toBeVisible({ timeout: 10000 })

    // 5. Type a list item into the editor
    await editor.click()
    await typeNumberedListItem(page, 'Completed the API refactoring')

    // 6. Wait for the collaboration server to persist the content
    const retroId = await currentDocumentId(page)
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 10000 })
    await waitForDocumentContent(page, 'weekly-retros', retroId, 'Completed the API refactoring')
    await waitForMyWeekItem(page, 'retro', 'Completed the API refactoring')

    // 7. Navigate back to /my-week using client-side navigation
    await page.getByRole('button', { name: 'Dashboard' }).click()
    await expect(page.getByRole('heading', { name: /^Week \d+$/ })).toBeVisible({ timeout: 10000 })

    // 8. Verify the retro content is visible on the my-week page
    await expect(page.getByText('Completed the API refactoring')).toBeVisible({ timeout: 15000 })
  })
})
