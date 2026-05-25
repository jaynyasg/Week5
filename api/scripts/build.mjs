import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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
    cwd: apiRoot,
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

const dbDist = resolve(apiRoot, 'dist/db');
mkdirSync(dbDist, { recursive: true });
cpSync(resolve(apiRoot, 'src/db/schema.sql'), resolve(dbDist, 'schema.sql'));

const migrationsDist = resolve(dbDist, 'migrations');
rmSync(migrationsDist, { recursive: true, force: true });
cpSync(resolve(apiRoot, 'src/db/migrations'), migrationsDist, { recursive: true });
