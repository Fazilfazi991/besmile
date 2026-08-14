-- Batch 9 deliberately reuses canonical finance aggregates; this migration only
-- creates the management-only entry permission for the read-only workspace.
insert into public.permissions(code,description) values ('business_status.view','View Accounts & Business Status') on conflict(code) do update set description=excluded.description;
insert into public.role_permissions(role,permission_id)
select r::public.employee_role,p.id
from unnest(array['Chairman','Director','General Manager']) r
join public.permissions p on p.code='business_status.view'
on conflict do nothing;
