// Runs axe-core accessibility scans against authenticated Ship pages.
// Logs in, navigates to each page, runs axe, outputs consolidated JSON.
//
// Run with: node eval/a11y/axe-baseline-authenticated.mjs
//
// Requires the Ship dev API + web servers to be running on default ports.

import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync } from 'fs';

const PAGES_TO_TEST = [
  { name: 'login',     url: 'http://localhost:5173/login',          authRequired: false },
  { name: 'docs',      url: 'http://localhost:5173/docs',           authRequired: true  },
  { name: 'projects',  url: 'http://localhost:5173/projects',       authRequired: true  },
  { name: 'team',      url: 'http://localhost:5173/team',           authRequired: true  },
];

const LOGIN = { email: 'dev@ship.local', password: 'admin123' };

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 1. Login first via the API so subsequent navigations are authenticated
  // Get CSRF token
  const csrfRes = await page.request.get('http://localhost:3000/api/csrf-token');
  const { token } = await csrfRes.json();

  // Login
  const loginRes = await page.request.post('http://localhost:3000/api/auth/login', {
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
    data: LOGIN,
  });
  if (!loginRes.ok()) {
    console.error('Login failed:', loginRes.status(), await loginRes.text());
    await browser.close();
    process.exit(1);
  }
  console.log('Login OK:', loginRes.status());

  // Get cookies from the login response and set them on the context
  // (the page.request shares the same cookie jar as page navigations within this context)

  const results = [];

  for (const target of PAGES_TO_TEST) {
    console.log(`Scanning ${target.name} (${target.url})...`);
    try {
      await page.goto(target.url, { waitUntil: 'networkidle', timeout: 15000 });
      // Brief settle time for any async UI
      await page.waitForTimeout(500);

      const axeResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'])
        .analyze();

      const summary = {
        page: target.name,
        url: page.url(),
        violations_total: axeResults.violations.length,
        by_severity: {
          critical: axeResults.violations.filter(v => v.impact === 'critical').length,
          serious:  axeResults.violations.filter(v => v.impact === 'serious').length,
          moderate: axeResults.violations.filter(v => v.impact === 'moderate').length,
          minor:    axeResults.violations.filter(v => v.impact === 'minor').length,
        },
        violations: axeResults.violations.map(v => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          helpUrl: v.helpUrl,
          tags: v.tags,
          node_count: v.nodes.length,
          sample_target: v.nodes[0]?.target,
          sample_html: v.nodes[0]?.html?.slice(0, 200),
        })),
        passes_count: axeResults.passes.length,
        incomplete_count: axeResults.incomplete.length,
      };

      results.push(summary);
      console.log(`  → ${summary.violations_total} violations (C:${summary.by_severity.critical} S:${summary.by_severity.serious} M:${summary.by_severity.moderate} m:${summary.by_severity.minor})`);
    } catch (err) {
      console.error(`  → ERROR scanning ${target.name}:`, err.message);
      results.push({ page: target.name, url: target.url, error: err.message });
    }
  }

  await browser.close();

  const output = {
    captured_at: new Date().toISOString(),
    tool: '@axe-core/playwright',
    pages_scanned: results.length,
    summary: results,
  };

  writeFileSync('eval/results/axe-baseline.json', JSON.stringify(output, null, 2));
  console.log('\nSaved to eval/results/axe-baseline.json');

  // Brief total summary
  const totalsBySeverity = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const r of results) {
    if (r.by_severity) {
      for (const sev of Object.keys(totalsBySeverity)) totalsBySeverity[sev] += r.by_severity[sev];
    }
  }
  console.log('\n=== Totals across all pages ===');
  console.log(`Critical: ${totalsBySeverity.critical}`);
  console.log(`Serious:  ${totalsBySeverity.serious}`);
  console.log(`Moderate: ${totalsBySeverity.moderate}`);
  console.log(`Minor:    ${totalsBySeverity.minor}`);
}

main().catch(e => { console.error(e); process.exit(1); });
