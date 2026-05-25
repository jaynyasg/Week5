import { describe, expect, it } from 'vitest';
import { generateOpenAPIDocument } from './index.js';

describe('FleetGraph OpenAPI schema', () => {
  it('registers every FleetGraph route', () => {
    const document = generateOpenAPIDocument();

    expect(document.paths['/fleetgraph/status']).toBeDefined();
    expect(document.paths['/fleetgraph/chat']).toBeDefined();
    expect(document.paths['/fleetgraph/findings']).toBeDefined();
    expect(document.paths['/fleetgraph/findings/{id}']).toBeDefined();
    expect(document.paths['/fleetgraph/deliveries/{id}']).toBeDefined();
    expect(document.paths['/fleetgraph/runs/{id}']).toBeDefined();
    expect(document.paths['/fleetgraph/actions/{id}/decision']).toBeDefined();
  });
});
