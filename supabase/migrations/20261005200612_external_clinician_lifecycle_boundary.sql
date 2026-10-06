-- External account state is not employee lifecycle history. Preserve each
-- environment's internal trigger body and allow external state administration
-- only through a trusted service operation (never the self-edit RPC).
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.enforce_employee_status_change()'::regprocedure);
 definition:=regexp_replace(definition,'begin',
 E'begin\n if not old.is_employee then\n  if new.status is distinct from old.status and coalesce(auth.role(),'''')<>''service_role'' then raise exception ''External account state requires server administration.'' using errcode=''42501''; end if;\n  return new;\n end if;','i');
 execute definition;
 definition:=pg_get_functiondef('public.record_employee_status_change()'::regprocedure);
 definition:=regexp_replace(definition,'begin',
 E'begin\n if not new.is_employee then\n  if new.status is distinct from old.status then insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),''external_clinician_state_changed'',''profiles'',new.id,jsonb_build_object(''status'',old.status),jsonb_build_object(''status'',new.status)); end if;\n  return new;\n end if;','i');
 execute definition;
end $$;
revoke all on function public.enforce_employee_status_change(),public.record_employee_status_change() from public,anon,authenticated;
notify pgrst,'reload schema';
