-- Repair deployments where 048 was marked applied before the enum value existed.
-- This file sorts before 049_fleetgraph_foundation_tables.sql so the enum commit
-- is visible before any FleetGraph indexes reference 'fleetgraph_finding'.

ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'fleetgraph_finding';
