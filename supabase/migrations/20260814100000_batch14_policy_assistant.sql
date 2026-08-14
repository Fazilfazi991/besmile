-- Batch 14: grounded internal Policy Assistant and private policy knowledge base.

insert into public.permissions(code,description) values
  ('policy_assistant.use','Ask questions using approved BSmile policies'),
  ('policy_assistant.manage','Upload, review, publish, supersede and archive BSmile policies')
on conflict(code) do update set description=excluded.description;

do $$
begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role_id') then
    insert into public.role_permissions(role_id,permission_id)
    select role.id,permission.id from public.roles role cross join public.permissions permission
    where (permission.code='policy_assistant.use' and role.code in ('staff','psychologist','intern','general_manager','director','chairman','super_admin'))
       or (permission.code='policy_assistant.manage' and role.code in ('general_manager','director','chairman','super_admin'))
    on conflict do nothing;
  elsif exists(select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role') then
    execute $seed$
      insert into public.role_permissions(role,permission_id)
      select role_name::public.employee_role,permission.id
      from (values ('Staff'),('Psychologist'),('Intern'),('General Manager'),('Director'),('Chairman'),('Super Admin')) seed(role_name)
      join public.permissions permission on permission.code='policy_assistant.use'
      on conflict do nothing
    $seed$;
    execute $seed$
      insert into public.role_permissions(role,permission_id)
      select role_name::public.employee_role,permission.id
      from (values ('General Manager'),('Director'),('Chairman'),('Super Admin')) seed(role_name)
      join public.permissions permission on permission.code='policy_assistant.manage'
      on conflict do nothing
    $seed$;
  end if;
end $$;

create table public.policy_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check(char_length(trim(title)) between 3 and 180),
  version text not null check(char_length(trim(version)) between 1 and 30),
  document_type text not null check(char_length(trim(document_type)) between 2 and 60),
  applicable_to text not null check(char_length(trim(applicable_to)) between 2 and 300),
  effective_date date,
  last_updated_on date,
  status text not null default 'draft' check(status in ('draft','published','archived')),
  extraction_status text not null default 'ready' check(extraction_status in ('extracting','ready','failed')),
  extraction_error text,
  storage_bucket text not null default 'policy-documents' check(storage_bucket='policy-documents'),
  storage_path text not null unique,
  original_file_name text not null,
  file_size integer not null check(file_size between 1 and 26214400),
  checksum text not null,
  page_count integer not null check(page_count > 0),
  is_current boolean not null default false,
  supersedes_id uuid references public.policy_documents(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(title,version),
  check((status='published' and approved_at is not null and published_at is not null and is_current) or status<>'published'),
  check((status='archived' and archived_at is not null and not is_current) or status<>'archived')
);

create table public.policy_document_audiences (
  id uuid primary key default gen_random_uuid(),
  policy_document_id uuid not null references public.policy_documents(id) on delete cascade,
  audience_type text not null check(audience_type in ('all_authenticated','employees','role','department','profile')),
  audience_value text,
  created_at timestamptz not null default now(),
  unique(policy_document_id,audience_type,audience_value),
  check((audience_type in ('all_authenticated','employees') and audience_value is null) or (audience_type not in ('all_authenticated','employees') and nullif(trim(audience_value),'') is not null))
);

create table public.policy_sections (
  id uuid primary key default gen_random_uuid(),
  policy_document_id uuid not null references public.policy_documents(id) on delete cascade,
  section_number text,
  section_title text not null,
  content text not null check(char_length(trim(content)) between 20 and 12000),
  page_start integer not null check(page_start > 0),
  page_end integer not null check(page_end >= page_start),
  chunk_order integer not null check(chunk_order >= 0),
  search_text tsvector generated always as (to_tsvector('english',coalesce(section_number,'')||' '||section_title||' '||content)) stored,
  created_at timestamptz not null default now(),
  unique(policy_document_id,chunk_order)
);

create table public.policy_assistant_rate_limits (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check(request_count >= 0),
  primary key(profile_id)
);

create index policy_documents_current_idx on public.policy_documents(status,is_current,effective_date) where status='published';
create index policy_documents_type_idx on public.policy_documents(document_type,status);
create index policy_sections_document_idx on public.policy_sections(policy_document_id,chunk_order);
create index policy_sections_search_idx on public.policy_sections using gin(search_text);
create index policy_audiences_document_idx on public.policy_document_audiences(policy_document_id,audience_type,audience_value);
create unique index policy_one_current_version_idx on public.policy_documents(lower(title)) where status='published' and is_current;

drop trigger if exists policy_documents_touch_updated_at on public.policy_documents;
create trigger policy_documents_touch_updated_at before update on public.policy_documents for each row execute function public.touch_updated_at();

create or replace function public.policy_audience_matches(target uuid,subject uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.profiles profile
    join public.policy_document_audiences audience on audience.policy_document_id=target
    where profile.id=subject and profile.status='active' and (
      audience.audience_type='all_authenticated'
      or (audience.audience_type='employees' and coalesce(profile.is_employee,true))
      or (audience.audience_type='role' and lower(audience.audience_value)=lower(profile.role::text))
      or (audience.audience_type='department' and audience.audience_value=profile.department_id::text)
      or (audience.audience_type='profile' and audience.audience_value=profile.id::text)
    )
  )
$$;

create or replace function public.policy_document_visible(target uuid,include_drafts boolean default false)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.policy_documents document
    where document.id=target and (
      public.has_permission('policy_assistant.manage')
      or (
        public.has_permission('policy_assistant.use')
        and document.status='published' and document.is_current and document.extraction_status='ready'
        and (document.effective_date is null or document.effective_date<=current_date)
        and public.policy_audience_matches(document.id)
      )
    ) and (include_drafts or document.status='published' or public.has_permission('policy_assistant.manage'))
  )
$$;

alter table public.policy_documents enable row level security;
alter table public.policy_document_audiences enable row level security;
alter table public.policy_sections enable row level security;
alter table public.policy_assistant_rate_limits enable row level security;

grant select on public.policy_documents,public.policy_document_audiences,public.policy_sections to authenticated;
revoke all on public.policy_assistant_rate_limits from authenticated;

create policy "policy documents scoped read" on public.policy_documents for select to authenticated using(public.policy_document_visible(id,true));
create policy "policy documents managers delete drafts" on public.policy_documents for delete to authenticated using(public.has_permission('policy_assistant.manage') and status='draft');
create policy "policy audiences scoped read" on public.policy_document_audiences for select to authenticated using(public.policy_document_visible(policy_document_id,true));
create policy "policy sections scoped read" on public.policy_sections for select to authenticated using(public.policy_document_visible(policy_document_id,true));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('policy-documents','policy-documents',false,26214400,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy "policy pdf manager upload" on storage.objects for insert to authenticated with check(
  bucket_id='policy-documents' and owner_id=auth.uid()::text and public.has_permission('policy_assistant.manage')
);
create policy "policy pdf scoped read" on storage.objects for select to authenticated using(
  bucket_id='policy-documents' and exists(select 1 from public.policy_documents document where document.storage_path=name and public.policy_document_visible(document.id,true))
);
create policy "policy pdf manager cleanup" on storage.objects for delete to authenticated using(
  bucket_id='policy-documents' and public.has_permission('policy_assistant.manage')
);

create or replace function public.create_policy_document_draft(metadata jsonb,sections jsonb,audience jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid();
declare document_id uuid;
declare section_item jsonb;
declare audience_item jsonb;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if not public.has_permission('policy_assistant.manage') then raise exception 'Policy management permission required'; end if;
  if jsonb_typeof(sections)<>'array' or jsonb_array_length(sections)=0 then raise exception 'Extracted policy sections are required'; end if;
  if jsonb_typeof(audience)<>'array' or jsonb_array_length(audience)=0 then raise exception 'At least one policy audience is required'; end if;
  insert into public.policy_documents(title,version,document_type,applicable_to,effective_date,last_updated_on,storage_path,original_file_name,file_size,checksum,page_count,created_by,status,extraction_status)
  values(trim(metadata->>'title'),trim(metadata->>'version'),trim(metadata->>'document_type'),trim(metadata->>'applicable_to'),nullif(metadata->>'effective_date','')::date,nullif(metadata->>'last_updated_on','')::date,metadata->>'storage_path',metadata->>'original_file_name',(metadata->>'file_size')::integer,metadata->>'checksum',(metadata->>'page_count')::integer,actor,'draft','ready')
  returning id into document_id;
  for audience_item in select * from jsonb_array_elements(audience) loop
    insert into public.policy_document_audiences(policy_document_id,audience_type,audience_value)
    values(document_id,audience_item->>'audience_type',nullif(audience_item->>'audience_value',''));
  end loop;
  for section_item in select * from jsonb_array_elements(sections) loop
    insert into public.policy_sections(policy_document_id,section_number,section_title,content,page_start,page_end,chunk_order)
    values(document_id,nullif(section_item->>'section_number',''),section_item->>'section_title',section_item->>'content',(section_item->>'page_start')::integer,(section_item->>'page_end')::integer,(section_item->>'chunk_order')::integer);
  end loop;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(actor,'policy_document_uploaded','policy_documents',document_id,jsonb_build_object('title',metadata->>'title','version',metadata->>'version','section_count',jsonb_array_length(sections),'page_count',metadata->>'page_count'));
  return document_id;
end $$;

create or replace function public.publish_policy_document(target uuid)
returns public.policy_documents language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid();
declare current_row public.policy_documents;
declare previous_row public.policy_documents;
declare published public.policy_documents;
declare recipient record;
begin
  if actor is null or not public.has_permission('policy_assistant.manage') then raise exception 'Policy management permission required'; end if;
  select * into current_row from public.policy_documents where id=target for update;
  if not found or current_row.status<>'draft' or current_row.extraction_status<>'ready' then raise exception 'Only a successfully extracted draft may be published'; end if;
  if not exists(select 1 from public.policy_sections where policy_document_id=target) then raise exception 'Policy has no searchable sections'; end if;
  select * into previous_row from public.policy_documents where lower(title)=lower(current_row.title) and status='published' and is_current for update;
  if found then
    update public.policy_documents set status='archived',is_current=false,archived_by=actor,archived_at=now() where id=previous_row.id;
  end if;
  update public.policy_documents set status='published',is_current=true,approved_by=actor,approved_at=now(),published_at=now(),supersedes_id=previous_row.id,archived_by=null,archived_at=null where id=target returning * into published;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
  values(actor,'policy_document_published','policy_documents',target,to_jsonb(current_row),to_jsonb(published));
  for recipient in select profile.id from public.profiles profile where profile.status='active' and public.has_permission('policy_assistant.use',profile.id) and public.policy_audience_matches(target,profile.id) loop
    if not exists(select 1 from public.notifications notification where notification.profile_id=recipient.id and notification.type='policy_published' and notification.related_entity_id=target) then
      perform public.notify_user(recipient.id,'Policy published',published.title||' v'||published.version||' is now available in Policy Assistant.','policy_published',target,case when recipient.id=actor then '/admin/policy-assistant' else '/employee/policy-assistant' end,actor,'announcements','normal','none',false,jsonb_build_object('policy_document_id',target,'version',published.version));
    end if;
  end loop;
  return published;
end $$;

create or replace function public.archive_policy_document(target uuid)
returns public.policy_documents language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); declare old_row public.policy_documents; declare archived public.policy_documents;
begin
  if actor is null or not public.has_permission('policy_assistant.manage') then raise exception 'Policy management permission required'; end if;
  select * into old_row from public.policy_documents where id=target for update;
  if not found or old_row.status='archived' then raise exception 'Policy cannot be archived'; end if;
  update public.policy_documents set status='archived',is_current=false,archived_by=actor,archived_at=now() where id=target returning * into archived;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data) values(actor,'policy_document_archived','policy_documents',target,to_jsonb(old_row),to_jsonb(archived));
  return archived;
end $$;

create or replace function public.search_policy_sections(search_query text,limit_count integer default 6,document_types text[] default null)
returns table(section_id uuid,document_id uuid,title text,version text,document_type text,applicable_to text,effective_date date,section_number text,section_title text,content text,page_start integer,page_end integer,relevance real)
language plpgsql stable security definer set search_path=public as $$
declare actor uuid:=auth.uid(); declare normalized text; declare query tsquery;
begin
  if actor is null or not public.has_permission('policy_assistant.use') then raise exception 'Policy Assistant permission required'; end if;
  normalized:=trim(regexp_replace(coalesce(search_query,''),'[^[:alnum:] ]',' ','g'));
  if char_length(normalized)<2 then return; end if;
  query:=to_tsquery('english',regexp_replace(normalized,'\s+',' | ','g'));
  return query
  select section.id,document.id,document.title,document.version,document.document_type,document.applicable_to,document.effective_date,section.section_number,section.section_title,section.content,section.page_start,section.page_end,
    (ts_rank_cd(section.search_text,query)+case when section.section_title ilike any(string_to_array('%'||replace(normalized,' ','%|%')||'%','|')) then 0.2 else 0 end)::real
  from public.policy_sections section join public.policy_documents document on document.id=section.policy_document_id
  where public.policy_document_visible(document.id)
    and (document_types is null or cardinality(document_types)=0 or document.document_type=any(document_types))
    and section.search_text@@query
  order by relevance desc,document.published_at desc,section.chunk_order
  limit greatest(1,least(coalesce(limit_count,6),8));
end $$;

create or replace function public.check_policy_assistant_rate_limit()
returns boolean language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); declare row_state public.policy_assistant_rate_limits;
begin
  if actor is null then return false; end if;
  insert into public.policy_assistant_rate_limits(profile_id,window_started_at,request_count) values(actor,now(),1)
  on conflict(profile_id) do update set
    window_started_at=case when policy_assistant_rate_limits.window_started_at<now()-interval '5 minutes' then now() else policy_assistant_rate_limits.window_started_at end,
    request_count=case when policy_assistant_rate_limits.window_started_at<now()-interval '5 minutes' then 1 else policy_assistant_rate_limits.request_count+1 end
  returning * into row_state;
  return row_state.request_count<=20;
end $$;

revoke all on function public.create_policy_document_draft(jsonb,jsonb,jsonb) from public,anon;
revoke all on function public.publish_policy_document(uuid) from public,anon;
revoke all on function public.archive_policy_document(uuid) from public,anon;
revoke all on function public.search_policy_sections(text,integer,text[]) from public,anon;
revoke all on function public.check_policy_assistant_rate_limit() from public,anon;
grant execute on function public.create_policy_document_draft(jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.publish_policy_document(uuid) to authenticated;
grant execute on function public.archive_policy_document(uuid) to authenticated;
grant execute on function public.search_policy_sections(text,integer,text[]) to authenticated;
grant execute on function public.check_policy_assistant_rate_limit() to authenticated;

notify pgrst,'reload schema';
