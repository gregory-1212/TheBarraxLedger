-- Migration 001: Enable required Postgres extensions
-- LED-4: First migration; verifies the runner works end-to-end.
-- Extensions we need across the V1 feature set:
--   pgcrypto    — gen_random_uuid() default for primary keys
--   pg_trgm     — fuzzy text matching (LED-47: receipt vendor match)

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
