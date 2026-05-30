import { describe, expect, it } from 'vitest';
import { generateOpenAPIDocument } from './index.js';

describe('FleetGraph OpenAPI schema', () => {
  it('registers every FleetGraph route', () => {
    const document = generateOpenAPIDocument();

    expect(document.paths['/fleetgraph/status']).toBeDefined();
    expect(document.paths['/fleetgraph/ops']).toBeDefined();
    expect(document.paths['/fleetgraph/chat']).toBeDefined();
    expect(document.paths['/fleetgraph/preferences']).toBeDefined();
    expect(document.paths['/fleetgraph/detectors']).toBeDefined();
    expect(document.paths['/fleetgraph/detectors/{detectorId}']).toBeDefined();
    expect(document.paths['/fleetgraph/replay/scenarios']).toBeDefined();
    expect(document.paths['/fleetgraph/replay/scenarios/{id}/run']).toBeDefined();
    expect(document.paths['/fleetgraph/findings']).toBeDefined();
    expect(document.paths['/fleetgraph/findings/{id}']).toBeDefined();
    expect(document.paths['/fleetgraph/deliveries/{id}']).toBeDefined();
    expect(document.paths['/fleetgraph/runs/{id}']).toBeDefined();
    expect(document.paths['/fleetgraph/actions/{id}/decision']).toBeDefined();
  });

  it('documents user notification preferences', () => {
    const document = generateOpenAPIDocument();

    expect(document.paths['/fleetgraph/preferences']?.get).toBeDefined();
    expect(document.paths['/fleetgraph/preferences']?.patch).toBeDefined();
  });

  it('documents route-context filters for delivered findings', () => {
    const document = generateOpenAPIDocument();
    const operation = document.paths['/fleetgraph/findings']?.get;

    expect(operation?.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'documentId', in: 'query' }),
      expect.objectContaining({ name: 'projectId', in: 'query' }),
    ]));
  });
});
