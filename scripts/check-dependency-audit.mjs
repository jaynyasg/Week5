#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const result = spawnSync('pnpm', ['audit', '--json'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

const rawOutput = result.stdout?.trim();

if (!rawOutput) {
  console.error('pnpm audit did not return JSON output.');
  if (result.stderr) {
    console.error(result.stderr.trim());
  }
  process.exit(result.status || 1);
}

let audit;
try {
  audit = JSON.parse(rawOutput);
} catch (error) {
  console.error('Unable to parse pnpm audit JSON output.');
  console.error(error instanceof Error ? error.message : String(error));
  console.error(rawOutput);
  process.exit(1);
}

const vulnerabilities = audit.metadata?.vulnerabilities || {};
const severities = ['critical', 'high', 'moderate', 'low', 'info'];
const counts = Object.fromEntries(
  severities.map((severity) => [severity, Number(vulnerabilities[severity] || 0)])
);
const total = severities.reduce((sum, severity) => sum + counts[severity], 0);

console.log('Dependency audit summary:');
for (const severity of severities) {
  console.log(`  ${severity}: ${counts[severity]}`);
}

if (total === 0) {
  console.log('Dependency audit gate passed.');
  process.exit(0);
}

console.error('Dependency audit gate failed.');

if (Array.isArray(audit.actions) && audit.actions.length > 0) {
  console.error('Suggested remediation actions:');
  for (const action of audit.actions.slice(0, 10)) {
    const moduleName = action.module || '(unknown module)';
    const target = action.target ? ` -> ${action.target}` : '';
    const count = Array.isArray(action.resolves) ? action.resolves.length : 0;
    console.error(`  ${action.action} ${moduleName}${target} (${count} advisories)`);
  }
}

process.exit(1);
