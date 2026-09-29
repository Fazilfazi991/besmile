-- Keep in-app notification persistence and the surrounding business transaction
-- independent from optional external browser-push delivery.
-- Vault values are provisioned separately; this migration contains no secrets.

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
  -- This trigger runs only after an in-app notification has been inserted. Every
  -- fallible statement below belongs exclusively to optional external delivery,
  -- so its failure must not abort the notification or its business transaction.
  begin
    select decrypted_secret into dispatch_secret
    from vault.decrypted_secrets
    where name = 'bsmile_push_dispatch_secret';

    select decrypted_secret into dispatch_url
    from vault.decrypted_secrets
    where name = 'bsmile_push_dispatch_url';

    if nullif(pg_catalog.btrim(dispatch_secret), '') is null
       or nullif(pg_catalog.btrim(dispatch_url), '') is null then
      return new;
    end if;

    select http_post into request_id
    from net.http_post(
      dispatch_url,
      pg_catalog.jsonb_build_object(
        'old_record', null,
        'record', pg_catalog.to_jsonb(new),
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

    if request_id is not null then
      insert into supabase_functions.hooks (hook_table_id, hook_name, request_id)
      values (tg_relid, tg_name, request_id);
    end if;
  exception
    when others then
      -- The exception boundary is intentionally limited to external push setup,
      -- queueing, and hook bookkeeping. Authorization and business constraints
      -- execute outside this function and continue to fail normally.
      return new;
  end;

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
