-- Must run in its own transaction before 0040: PostgreSQL does not permit
-- newly added enum values to be used until the transaction commits.
do $$ begin alter type public.app_role add value if not exists 'psychologist'; exception when undefined_object then null; end $$;
do $$ begin alter type public.app_role add value if not exists 'social_worker'; exception when undefined_object then null; end $$;
do $$ begin alter type public.app_role add value if not exists 'intern'; exception when undefined_object then null; end $$;
do $$ begin alter type public.app_role add value if not exists 'guest_sales'; exception when undefined_object then null; end $$;
do $$ begin alter type public.employee_role add value if not exists 'Psychologist'; exception when undefined_object then null; end $$;
do $$ begin alter type public.employee_role add value if not exists 'Social Worker'; exception when undefined_object then null; end $$;
do $$ begin alter type public.employee_role add value if not exists 'Intern'; exception when undefined_object then null; end $$;
do $$ begin alter type public.employee_role add value if not exists 'Guest – Sales'; exception when undefined_object then null; end $$;
