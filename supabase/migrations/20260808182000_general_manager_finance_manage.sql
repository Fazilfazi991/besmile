-- Business decision: every General Manager may complete Finance payments.
-- Use the role-permission layer so the capability applies consistently to all GMs.
insert into public.role_permissions(role, permission_id)
select 'General Manager'::public.employee_role, permission.id
from public.permissions permission
where permission.code = 'finance.manage'
on conflict do nothing;

notify pgrst, 'reload schema';
