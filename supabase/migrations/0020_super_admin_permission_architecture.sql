-- Run and commit this migration before 0021. PostgreSQL intentionally prevents a
-- new enum value from being used in the same transaction that adds it.
alter type public.app_role add value if not exists 'super_admin';
