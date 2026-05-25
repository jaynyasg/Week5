#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AssistantChatResponse } from '@ship/shared';
import {
  evaluateAssistantResponses,
  type AssistantEvalCase,
} from './eval-harness.js';

interface AssistantEvalInput {
  cases: AssistantEvalCase[];
  responses: Record<string, AssistantChatResponse>;
}

const DEFAULT_INPUT = 'src/services/assistant/eval-fixtures/week2-parity.sample.json';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (hasArg(args, '--help') || hasArg(args, '-h')) {
    printHelp();
    return;
  }

  const inputPath = resolve(process.cwd(), readArg(args, '--input') ?? DEFAULT_INPUT);
  const outputArg = readArg(args, '--output');
  const outputPath = outputArg ? resolve(process.cwd(), outputArg) : null;
  const minScore = readMinScore(readArg(args, '--min-score'));

  const input = parseEvalInput(JSON.parse(await readFile(inputPath, 'utf8')));
  const report = evaluateAssistantResponses(input.cases, input.responses);
  const reportJson = `${JSON.stringify(report, null, 2)}\n`;

  console.log(`Assistant eval: ${report.passed}/${report.total} passed (score ${report.score})`);
  console.log(reportJson.trimEnd());

  if (outputPath) {
    await writeFile(outputPath, reportJson, 'utf8');
    console.log(`Assistant eval report written to ${outputPath}`);
  }

  if (report.score < minScore) {
    console.error(`Assistant eval failed: score ${report.score} is below minimum ${minScore}.`);
    process.exitCode = 1;
  }
}

function parseEvalInput(value: unknown): AssistantEvalInput {
  if (!value || typeof value !== 'object') {
    throw new Error('Assistant eval input must be a JSON object.');
  }

  const candidate = value as Partial<AssistantEvalInput>;
  if (!Array.isArray(candidate.cases)) {
    throw new Error('Assistant eval input must include a cases array.');
  }

  if (!candidate.responses || typeof candidate.responses !== 'object' || Array.isArray(candidate.responses)) {
    throw new Error('Assistant eval input must include a responses object.');
  }

  return {
    cases: candidate.cases,
    responses: candidate.responses as Record<string, AssistantChatResponse>,
  };
}

function readArg(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function hasArg(args: string[], name: string): boolean {
  return args.includes(name);
}

function readMinScore(value: string | undefined): number {
  if (!value) return 1;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error('--min-score must be a number between 0 and 1.');
  }
  return parsed;
}

function printHelp(): void {
  console.log([
    'Usage: pnpm --filter @ship/api assistant:eval [options]',
    '',
    'Options:',
    `  --input <path>       Eval input JSON. Defaults to ${DEFAULT_INPUT}`,
    '  --output <path>      Write the JSON report to a file',
    '  --min-score <0..1>   Fail when the report score is below this value. Defaults to 1',
  ].join('\n'));
}

await main();
