import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/services/fleetgraph/costs.test.ts',
      'src/services/fleetgraph/eval-harness.test.ts',
      'src/services/fleetgraph/graph.test.ts',
      'src/services/fleetgraph/runner-usage.test.ts',
      'src/scripts/fleetgraph-drain.test.ts',
    ],
  },
});
