-- FleetGraph document type.
--
-- The migration runner wraps each file in a transaction, and PostgreSQL does
-- not allow a newly added enum value to be referenced until that transaction
-- commits. Keep this migration limited to the enum addition; dependent tables
-- and indexes live in 049_fleetgraph_foundation_tables.sql.

ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'fleetgraph_finding';
