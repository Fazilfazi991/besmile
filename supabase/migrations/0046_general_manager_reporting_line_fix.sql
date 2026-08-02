-- Restore the reporting lines required by the General Manager's scoped task
-- policies.  This is intentionally limited to the two official BSmile staff
-- records that were imported without a manager; QA and legacy local accounts
-- are not changed.
with general_manager as (
  select id
  from public.profiles
  where lower(email) = 'bsmile.gm@gmail.com'
    and employee_code = 'A001'
    and role = 'general_manager'
    and status = 'active'
  limit 1
)
update public.profiles staff
set manager_id = general_manager.id,
    updated_at = now()
from general_manager
where staff.employee_code in ('A005', 'A006')
  and staff.status = 'active'
  and staff.manager_id is null;
