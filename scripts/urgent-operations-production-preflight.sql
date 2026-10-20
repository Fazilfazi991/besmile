-- READ ONLY. Run against ksmqzxncdvuxiabypjth, save the result privately,
-- and review before any migration or account grant. No credentials are queried.
select jsonb_build_object(
  'captured_at', now(),
  'identities', (select jsonb_agg(jsonb_build_object(
    'id', p.id, 'full_name', p.full_name, 'email', p.email,
    'auth_id', u.id, 'auth_email', u.email, 'email_confirmed_at', u.email_confirmed_at,
    'auth_deleted_at', u.deleted_at, 'banned_until', u.banned_until,
    'role', p.role, 'status', p.status, 'is_employee', p.is_employee,
    'login_enabled', p.login_enabled, 'workforce_visible', p.workforce_visible,
    'onboarding_required', p.onboarding_required, 'removed_at', p.removed_at,
    'employee_code', p.employee_code, 'designation', p.designation,
    'department_id', p.department_id, 'department', d.name))
    from public.profiles p left join auth.users u on u.id = p.id
    left join public.departments d on d.id = p.department_id
    where p.id in ('28739db2-cf25-4a4a-a817-dbef90153853',
      '04f7ade2-99ee-43d1-b4c0-de2cd168fc39', '28516281-ec1c-4902-a786-346e1a51f001')
      or (p.is_employee and (p.full_name ilike '%Faiz%' or p.full_name ilike '%Diya%'))),
  'definitions', (select jsonb_agg(jsonb_build_object('signature', p.oid::regprocedure::text,
      'definition', pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','clinician_private') and p.proname in
      ('can_review_daily_work','has_permission','internal_has_permission','active_direct_permission',
       'appointment_has_permission','appointment_patient_access','appointment_patient_options',
       'create_doctor_appointment_v2','validate_finance_transaction_master_data','finance_audit_event'))),
  'finance_audit_triggers', (select jsonb_agg(jsonb_build_object('name', t.tgname,
    'enabled', t.tgenabled, 'definition', pg_get_triggerdef(t.oid))) from pg_trigger t
    where t.tgrelid='public.finance_transactions'::regclass and not t.tgisinternal),
  'policies', (select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname='public'
    and tablename in ('daily_work_updates','finance_transactions','finance_accounts',
      'finance_expense_categories','outsourced_doctors','doctor_weekly_availability','doctor_appointments')),
  'grants', (select jsonb_agg(to_jsonb(g) || jsonb_build_object('permission_code', permission.code))
    from public.user_permission_grants g join public.permissions permission on permission.id=g.permission_id
    where g.profile_id in ('04f7ade2-99ee-43d1-b4c0-de2cd168fc39','28516281-ec1c-4902-a786-346e1a51f001')
      or g.profile_id in (select p.id from public.profiles p where p.is_employee
        and (p.full_name ilike '%Faiz%' or p.full_name ilike '%Diya%'))),
  'calendar', (select jsonb_agg(to_jsonb(e)) from public.holiday_calendar_events e
    where e.title='Dussehra' and e.year in (2026,2027)),
  'legacy_holidays', (select jsonb_agg(to_jsonb(h)) from public.holidays h where h.name='Dussehra'),
  'finance_accounts', (select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name,
    'currency', a.currency, 'is_active', a.is_active)) from public.finance_accounts a),
  'marketing_category', (select jsonb_agg(to_jsonb(c)) from public.finance_expense_categories c where c.name='Marketing')
) as urgent_operations_snapshot;
