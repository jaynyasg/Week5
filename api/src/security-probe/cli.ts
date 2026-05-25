#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { parseSecurityProbeConfig, SecurityProbeConfigError } from './config.js';
import { runSecurityProbe } from './index.js';
import { writeSecurityProbeReports } from './reporter.js';

async function writeStdout(value: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    process.stdout.write(value, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function printMarkdownReport(markdownPath: string): Promise<void> {
  const markdown = await readFile(markdownPath, 'utf8');
  const chunkSize = 16 * 1024;

  await writeStdout(`\n--- Ship Security Probe Markdown Report (${Buffer.byteLength(markdown)} bytes) ---\n\n`);
  for (let offset = 0; offset < markdown.length; offset += chunkSize) {
    await writeStdout(markdown.slice(offset, offset + chunkSize));
  }
  await writeStdout('\n--- End Ship Security Probe Markdown Report ---\n');
}

async function main(): Promise<void> {
  try {
    const config = parseSecurityProbeConfig();
    const report = await runSecurityProbe(config);
    const { jsonPath, markdownPath } = await writeSecurityProbeReports(config, report);

    console.log('Ship security audit probe completed.');
    console.log(`JSON report: ${jsonPath}`);
    console.log(`Markdown report: ${markdownPath}`);
    await printMarkdownReport(markdownPath);
  } catch (error) {
    if (error instanceof SecurityProbeConfigError) {
      console.error(`Security probe configuration error: ${error.message}`);
      process.exitCode = 2;
      return;
    }

    console.error('Security probe failed.');
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  }
}

await main();
