-- The credential and destination are provisioned separately in Vault. Neither
-- value belongs in this migration or in a schema dump.
begin;

create or replace function private.dispatch_browser_push()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  dispatch_secret text;
  dispatch_url text;
  request_id bigint;
begin
  select decrypted_secret into dispatch_secret
  from vault.decrypted_secrets
  where name = 'bsmile_push_dispatch_secret';

  select decrypted_secret into dispatch_url
  from vault.decrypted_secrets
  where name = 'bsmile_push_dispatch_url';

  if pg_catalog.nullif(pg_catalog.btrim(dispatch_secret), '') is null
     or pg_catalog.nullif(pg_catalog.btrim(dispatch_url), '') is null then
    raise exception 'Push dispatch configuration is missing';
  end if;

  select http_post into request_id
  from net.http_post(
    dispatch_url,
    pg_catalog.jsonb_build_object(
      'old_record', old,
      'record', new,
      'type', tg_op,
      'table', tg_table_name,
      'schema', tg_table_schema
    ),
    '{}'::jsonb,
    pg_catalog.jsonb_build_object(
      'Content-type', 'application/json',
      'x-push-dispatch-secret', dispatch_secret
    ),
    5000
  );

  insert into supabase_functions.hooks (hook_table_id, hook_name, request_id)
  values (tg_relid, tg_name, request_id);

  return new;
end;
$function$;

alter function private.dispatch_browser_push() owner to postgres;
revoke all on function private.dispatch_browser_push()
  from public, anon, authenticated, service_role;

create or replace trigger "dispatch-browser-push"
after insert on public.notifications
for each row execute function private.dispatch_browser_push();

commit;
