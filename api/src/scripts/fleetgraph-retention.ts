import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db/client.js';
import { runFleetGraphRetention } from '../services/fleetgraph/retention.js';

async function main(): Promise<void> {
  const result = await runFleetGraphRetention();

  console.log(JSON.stringify(result));
}

function isMainModule(): boolean {
  return Boolean(process.argv[1])
    && resolve(process.argv[1]!) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  main()
    .catch((error) => {
      console.error('FleetGraph retention failed:', error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
