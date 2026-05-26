import { describe, expect, it } from 'vitest';
import { parseFleetGraphDrainOptions } from './fleetgraph-drain.js';

describe('FleetGraph drain command options', () => {
  it('keeps drain-only defaults for local/manual runs', () => {
    expect(parseFleetGraphDrainOptions({})).toEqual({
      workerId: undefined,
      maxJobs: 10,
      sweepOnDrain: false,
      sweepWorkspaceIds: [],
      sweepMaxWorkspaces: 25,
      sweepLimit: 25,
    });
  });

  it('parses bounded sweep settings for scheduled proactive coverage', () => {
    expect(parseFleetGraphDrainOptions({
      SHIP_FLEETGRAPH_WORKER_ID: 'render-cron-1',
      SHIP_FLEETGRAPH_DRAIN_MAX_JOBS: '7',
      SHIP_FLEETGRAPH_SWEEP_ON_DRAIN: 'true',
      SHIP_FLEETGRAPH_SWEEP_WORKSPACE_IDS: ' workspace-1,workspace-2 ,, ',
      SHIP_FLEETGRAPH_SWEEP_MAX_WORKSPACES: '3',
      SHIP_FLEETGRAPH_MAX_EVENTS_PER_SWEEP: '11',
    })).toEqual({
      workerId: 'render-cron-1',
      maxJobs: 7,
      sweepOnDrain: true,
      sweepWorkspaceIds: ['workspace-1', 'workspace-2'],
      sweepMaxWorkspaces: 3,
      sweepLimit: 11,
    });
  });

  it('falls back from invalid numeric and boolean values', () => {
    expect(parseFleetGraphDrainOptions({
      SHIP_FLEETGRAPH_DRAIN_MAX_JOBS: '-1',
      SHIP_FLEETGRAPH_SWEEP_ON_DRAIN: 'sometimes',
      SHIP_FLEETGRAPH_SWEEP_MAX_WORKSPACES: '0',
      SHIP_FLEETGRAPH_MAX_EVENTS_PER_SWEEP: 'NaN',
    })).toMatchObject({
      maxJobs: 10,
      sweepOnDrain: false,
      sweepMaxWorkspaces: 25,
      sweepLimit: 25,
    });
  });
});
