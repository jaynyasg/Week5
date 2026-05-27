-- Rename sprint-related document types to week terminology
-- Part of Sprint → Week rename refactor

-- Rename document_type enum values when the legacy labels still exist.
-- Some deployed databases already have the week labels from schema bootstrap
-- but do not have the old sprint labels, so plain RENAME VALUE is not safe.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'document_type'::regtype
      AND enumlabel = 'sprint_plan'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'document_type'::regtype
      AND enumlabel = 'weekly_plan'
  ) THEN
    ALTER TYPE document_type RENAME VALUE 'sprint_plan' TO 'weekly_plan';
  ELSIF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'document_type'::regtype
      AND enumlabel = 'sprint_plan'
  ) AND EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'document_type'::regtype
      AND enumlabel = 'weekly_plan'
  ) THEN
    UPDATE documents SET document_type = 'weekly_plan' WHERE document_type = 'sprint_plan';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'document_type'::regtype
      AND enumlabel = 'sprint_retro'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'document_type'::regtype
      AND enumlabel = 'weekly_retro'
  ) THEN
    ALTER TYPE document_type RENAME VALUE 'sprint_retro' TO 'weekly_retro';
  ELSIF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'document_type'::regtype
      AND enumlabel = 'sprint_retro'
  ) AND EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'document_type'::regtype
      AND enumlabel = 'weekly_retro'
  ) THEN
    UPDATE documents SET document_type = 'weekly_retro' WHERE document_type = 'sprint_retro';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'document_type'::regtype
      AND enumlabel = 'sprint_review'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'document_type'::regtype
      AND enumlabel = 'weekly_review'
  ) THEN
    ALTER TYPE document_type RENAME VALUE 'sprint_review' TO 'weekly_review';
  ELSIF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'document_type'::regtype
      AND enumlabel = 'sprint_review'
  ) AND EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'document_type'::regtype
      AND enumlabel = 'weekly_review'
  ) THEN
    UPDATE documents SET document_type = 'weekly_review' WHERE document_type = 'sprint_review';
  END IF;
END $$;

-- Note: We keep 'sprint' as a document_type because it represents the sprint document itself.
-- The terminology change is "Sprint 3" → "Week of Jan 27" in UI, but the underlying
-- document concept remains valid. The sprint document stores sprint_number and owner_id
-- for derived 7-day windows.

-- Update accountability_type values in issue properties
-- Sprint-related accountability types become week-related
UPDATE documents
SET properties = jsonb_set(properties, '{accountability_type}', '"weekly_plan"')
WHERE properties->>'accountability_type' = 'sprint_plan';

UPDATE documents
SET properties = jsonb_set(properties, '{accountability_type}', '"weekly_review"')
WHERE properties->>'accountability_type' = 'sprint_review';

UPDATE documents
SET properties = jsonb_set(properties, '{accountability_type}', '"week_start"')
WHERE properties->>'accountability_type' = 'sprint_start';

UPDATE documents
SET properties = jsonb_set(properties, '{accountability_type}', '"week_issues"')
WHERE properties->>'accountability_type' = 'sprint_issues';
