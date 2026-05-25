import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);

function packageBin(packageName, binName) {
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const bin = typeof packageJson.bin === 'string'
    ? packageJson.bin
    : packageJson.bin?.[binName];

  if (!bin) {
    throw new Error(`Could not find ${binName} binary in ${packageName}`);
  }

  return resolve(dirname(packageJsonPath), bin);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(process.execPath, [packageBin('typescript', 'tsc')]);
run(process.execPath, [packageBin('vite', 'vite'), 'build'], {
  env: {
    ...process.env,
    VITE_API_URL: process.env.VITE_API_URL ?? '',
    VITE_WS_URL: process.env.VITE_WS_URL ?? '',
  },
});
