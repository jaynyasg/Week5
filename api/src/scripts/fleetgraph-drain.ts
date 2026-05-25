import { drainFleetGraphQueue } from '../services/fleetgraph/sweep.js';
import { pool } from '../db/client.js';

async function main(): Promise<void> {
  const maxJobs = Number(process.env.SHIP_FLEETGRAPH_DRAIN_MAX_JOBS ?? '10');
  const result = await drainFleetGraphQueue({
    workerId: process.env.SHIP_FLEETGRAPH_WORKER_ID,
    maxJobs: Number.isFinite(maxJobs) && maxJobs > 0 ? maxJobs : 10,
  });

  console.log(JSON.stringify(result));
}

main()
  .catch((error) => {
    console.error('FleetGraph drain failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
