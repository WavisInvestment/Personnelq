/*
  User-facing names of the two official assessments no longer mention the framework they are based on.
  Only text shown to people changes; slugs, questions and scoring are untouched.
*/
UPDATE "Assessment"
SET "name" = 'Free personality snapshot',
    "description" = 'A quick first look at your personality, with a short written analysis.'
WHERE "slug" = 'ocean-snapshot' AND "organization_id" IS NULL;

UPDATE "Assessment"
SET "name" = 'Full personality assessment',
    "description" = 'The complete 50-question profile, with your personality class and a detailed reading of every dimension.'
WHERE "slug" = 'ocean-full' AND "organization_id" IS NULL;
