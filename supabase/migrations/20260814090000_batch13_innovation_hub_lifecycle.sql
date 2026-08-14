-- Batch 13: upgrade the existing Idea Hub into the canonical, private Innovation Hub.
-- Additive only: original proposal columns and attachment records are preserved.

insert into public.permissions(code, description) values
  ('innovation.view_self', 'View own Innovation Hub submissions'),
  ('innovation.create', 'Submit Innovation Hub proposals'),
  ('innovation.view_all', 'View all Innovation Hub proposals'),
  ('innovation.review', 'Review and decide Innovation Hub proposals'),
  ('innovation.manage', 'Manage Innovation Hub implementation')
on conflict(code) do update set description = excluded.description;

do $$
begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role_id') then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id
    from public.roles role cross join public.permissions permission
    where (role.code in ('staff','psychologist','intern','general_manager','director','chairman','super_admin') and permission.code in ('innovation.view_self','innovation.create'))
       or (role.code in ('general_manager','director','chairman','super_admin') and permission.code in ('innovation.view_all','innovation.review','innovation.manage'))
    on conflict do nothing;
  elsif exists(select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role') then
    execute $seed$
      insert into public.role_permissions(role, permission_id)
      select role_name::public.employee_role, permission.id
      from (values
        ('Staff'),('Psychologist'),('Intern'),('General Manager'),('Director'),('Chairman'),('Super Admin')
      ) seed(role_name)
      join public.permissions permission on permission.code in ('innovation.view_self','innovation.create')
      on conflict do nothing
    $seed$;
    execute $seed$
      insert into public.role_permissions(role, permission_id)
      select role_name::public.employee_role, permission.id
      from (values ('General Manager'),('Director'),('Chairman'),('Super Admin')) seed(role_name)
      join public.permissions permission on permission.code in ('innovation.view_all','innovation.review','innovation.manage')
      on conflict do nothing
    $seed$;
  end if;
end $$;

alter table public.ideas
  add column if not exists priority text not null default 'medium',
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists reviewer_id uuid references public.profiles(id) on delete set null,
  add column if not exists target_date date,
  add column if not exists progress_percent integer not null default 0,
  add column if not exists decision_notes text,
  add column if not exists implementation_note text,
  add column if not exists linked_task_id uuid references public.tasks(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists implemented_at timestamptz,
  add column if not exists implemented_by uuid references public.profiles(id) on delete set null,
  add column if not exists rejected_at timestamptz,
  add column if not exists lock_version integer not null default 1;

alter table public.ideas drop constraint if exists ideas_status_check;
alter table public.ideas drop constraint if exists ideas_priority_check;
alter table public.ideas drop constraint if exists ideas_progress_percent_check;
alter table public.ideas drop constraint if exists ideas_expected_benefit_check;

update public.ideas set status = case status
  when 'Under Consideration' then 'under_review'
  when 'Implemented' then 'implemented'
  when 'Not Proceeding' then 'rejected'
  when 'On Hold' then 'under_review'
  when 'Archived' then 'rejected'
  else 'submitted'
end;
update public.ideas set priority = lower(priority), progress_percent = greatest(0, least(100, progress_percent));

alter table public.ideas
  add constraint ideas_status_check check(status in ('submitted','under_review','approved','in_progress','implemented','rejected')),
  add constraint ideas_priority_check check(priority in ('low','medium','high','critical')),
  add constraint ideas_progress_percent_check check(progress_percent between 0 and 100),
  add constraint ideas_expected_benefit_check check(expected_benefit is null or char_length(trim(expected_benefit)) between 1 and 3000);
alter table public.ideas alter column expected_benefit drop not null;

alter table public.idea_comments add column if not exists is_visible_to_submitter boolean not null default true;
alter table public.idea_status_history add column if not exists event_type text not null default 'status_changed';
alter table public.idea_status_history add column if not exists before_data jsonb;
alter table public.idea_status_history add column if not exists after_data jsonb;
alter table public.idea_status_history add column if not exists request_key text;

create unique index if not exists innovation_history_request_key_idx on public.idea_status_history(idea_id, request_key) where request_key is not null;
create index if not exists ideas_owner_id_idx on public.ideas(owner_id) where owner_id is not null;
create index if not exists ideas_priority_idx on public.ideas(priority);
create index if not exists ideas_target_date_idx on public.ideas(target_date) where target_date is not null;

insert into public.idea_categories(name, description, sort_order)
select item.name, item.description, item.sort_order from (values
 ('Operations','Operational improvements',10),
 ('Client Experience','Client and customer experience improvements',20),
 ('Clinical Service','Non-confidential clinical service improvements',30),
 ('Technology','Systems, automation, and technology improvements',40),
 ('Marketing','Marketing improvements',50),
 ('HR / People','People and workplace improvements',60),
 ('Finance / Cost Saving','Time and cost saving improvements',70),
 ('Process Improvement','Workflow and process improvements',80),
 ('Product / Service','Product and service improvements',90),
 ('Other','Other internal improvements',100)
) item(name, description, sort_order)
on conflict(name) do update set description=excluded.description, sort_order=excluded.sort_order, is_active=true;

create or replace function public.innovation_can_view(target uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.ideas idea
    where idea.id=target and (
      (idea.submitted_by=auth.uid() and public.has_permission('innovation.view_self'))
      or public.has_permission('innovation.view_all')
      or public.has_permission('innovation.review')
      or public.has_permission('innovation.manage')
    )
  )
$$;

create or replace function public.idea_is_visible(target uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.innovation_can_view(target)
$$;

drop trigger if exists ideas_update_permission_guard on public.ideas;
drop trigger if exists idea_event_notification on public.ideas;
drop trigger if exists idea_comment_notification on public.idea_comments;
drop trigger if exists idea_support_activity on public.idea_supports;

drop policy if exists "idea categories viewable" on public.idea_categories;
create policy "innovation categories viewable" on public.idea_categories for select to authenticated using(
  deleted_at is null and (is_active or public.has_permission('ideas.manage_categories'))
  and (public.has_permission('innovation.create') or public.has_permission('innovation.view_self') or public.has_permission('innovation.view_all') or public.has_permission('innovation.review') or public.has_permission('innovation.manage'))
);

drop policy if exists "ideas readable" on public.ideas;
drop policy if exists "ideas creatable" on public.ideas;
drop policy if exists "ideas editable" on public.ideas;
create policy "innovations scoped read" on public.ideas for select to authenticated using(
  (submitted_by=auth.uid() and public.has_permission('innovation.view_self'))
  or public.has_permission('innovation.view_all') or public.has_permission('innovation.review') or public.has_permission('innovation.manage')
);
create policy "innovations self submit" on public.ideas for insert to authenticated with check(
  submitted_by=auth.uid() and public.has_permission('innovation.create') and status='submitted'
  and owner_id is null and reviewer_id is null and priority='medium' and target_date is null and progress_percent=0
  and approved_at is null and implemented_at is null and rejected_at is null and linked_task_id is null
);
create policy "innovations own proposal edit" on public.ideas for update to authenticated using(
  submitted_by=auth.uid() and status='submitted' and public.has_permission('innovation.create')
) with check(submitted_by=auth.uid() and status='submitted');

create or replace function public.innovation_guard_own_edit()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if not (public.has_permission('innovation.review') or public.has_permission('innovation.manage')) and (
    new.submitted_by is distinct from old.submitted_by or new.status is distinct from old.status
    or new.priority is distinct from old.priority or new.owner_id is distinct from old.owner_id
    or new.reviewer_id is distinct from old.reviewer_id or new.target_date is distinct from old.target_date
    or new.progress_percent is distinct from old.progress_percent or new.decision_notes is distinct from old.decision_notes
    or new.implementation_note is distinct from old.implementation_note or new.linked_task_id is distinct from old.linked_task_id
    or new.approved_at is distinct from old.approved_at or new.implemented_at is distinct from old.implemented_at
    or new.implemented_by is distinct from old.implemented_by or new.rejected_at is distinct from old.rejected_at
    or new.lock_version is distinct from old.lock_version
  ) then raise exception 'Only proposal fields can be edited before review'; end if;
  return new;
end $$;
create trigger innovation_own_edit_guard before update on public.ideas for each row execute function public.innovation_guard_own_edit();

drop policy if exists "idea comments readable" on public.idea_comments;
drop policy if exists "idea comments create" on public.idea_comments;
drop policy if exists "idea comments update" on public.idea_comments;
create policy "innovation notes scoped read" on public.idea_comments for select to authenticated using(
  public.innovation_can_view(idea_id) and (public.has_permission('innovation.review') or public.has_permission('innovation.manage') or is_visible_to_submitter)
);
create policy "innovation reviewer notes create" on public.idea_comments for insert to authenticated with check(
  author_employee_id=auth.uid() and (public.has_permission('innovation.review') or public.has_permission('innovation.manage')) and public.innovation_can_view(idea_id)
);

drop policy if exists "idea attachments readable" on public.idea_attachments;
drop policy if exists "idea attachments create" on public.idea_attachments;
drop policy if exists "idea attachments update" on public.idea_attachments;
create policy "innovation attachments scoped read" on public.idea_attachments for select to authenticated using(deleted_at is null and public.innovation_can_view(idea_id));
create policy "innovation attachments own create" on public.idea_attachments for insert to authenticated with check(uploaded_by=auth.uid() and public.innovation_can_view(idea_id));
create policy "innovation attachments own soft update" on public.idea_attachments for update to authenticated using(uploaded_by=auth.uid() and public.innovation_can_view(idea_id)) with check(uploaded_by=auth.uid());

drop policy if exists "idea status history readable" on public.idea_status_history;
drop policy if exists "idea status history insertable" on public.idea_status_history;
create policy "innovation history scoped read" on public.idea_status_history for select to authenticated using(public.innovation_can_view(idea_id));
revoke insert, update, delete on public.idea_status_history from authenticated;

drop policy if exists "idea activity logs readable" on public.idea_activity_logs;
drop policy if exists "idea activity logs insertable" on public.idea_activity_logs;
create policy "innovation activity scoped read" on public.idea_activity_logs for select to authenticated using(idea_id is not null and public.innovation_can_view(idea_id));
revoke insert, update, delete on public.idea_activity_logs from authenticated;

-- The social-feed support system remains preserved for compatibility but is no longer exposed.
drop policy if exists "idea supports readable" on public.idea_supports;
drop policy if exists "idea supports own create" on public.idea_supports;
drop policy if exists "idea supports own delete" on public.idea_supports;
revoke all on public.idea_supports from authenticated;

drop policy if exists "idea attachment reads" on storage.objects;
drop policy if exists "idea attachment uploads" on storage.objects;
drop policy if exists "idea attachment deletes" on storage.objects;
create policy "innovation attachment files read" on storage.objects for select to authenticated using(
  bucket_id='idea-attachments' and public.innovation_can_view((storage.foldername(name))[2]::uuid)
);
create policy "innovation attachment files insert" on storage.objects for insert to authenticated with check(
  bucket_id='idea-attachments' and public.innovation_can_view((storage.foldername(name))[2]::uuid)
);

create or replace function public.innovation_record_submission()
returns trigger language plpgsql security definer set search_path=public as $$
declare recipient record;
begin
  insert into public.idea_status_history(idea_id,previous_status,new_status,event_type,reason,changed_by,after_data)
  values(new.id,null,'submitted','submitted','Innovation submitted',new.submitted_by,to_jsonb(new));
  insert into public.idea_activity_logs(idea_id,action_type,actor_employee_id,metadata)
  values(new.id,'submitted',new.submitted_by,jsonb_build_object('title',new.title));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(new.submitted_by,'innovation_submitted','ideas',new.id,to_jsonb(new));
  for recipient in select profile.id from public.profiles profile where profile.status='active' and public.has_permission('innovation.review',profile.id) loop
    if not exists(select 1 from public.notifications n where n.profile_id=recipient.id and n.type='innovation_submitted' and n.related_entity_id=new.id) then
      perform public.notify_user(recipient.id,'New innovation submitted',new.title,'innovation_submitted',new.id,'/admin/innovation/'||new.id,new.submitted_by,'innovation','normal','none',false,jsonb_build_object('innovation_id',new.id,'event_key','submitted'));
    end if;
  end loop;
  return new;
end $$;
create trigger innovation_submission_event after insert on public.ideas for each row execute function public.innovation_record_submission();

create or replace function public.innovation_transition(
  target uuid,
  expected_status text,
  next_status text,
  next_priority text default null,
  next_owner uuid default null,
  next_target_date date default null,
  next_progress integer default null,
  decision_note text default null,
  implementation_text text default null,
  task_link uuid default null,
  request_key text default null
) returns public.ideas
language plpgsql security definer set search_path=public as $$
declare actor uuid := auth.uid();
declare current_row public.ideas;
declare updated_row public.ideas;
declare event_name text;
declare notification_type text;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if not (public.has_permission('innovation.review') or public.has_permission('innovation.manage')) then raise exception 'Innovation management permission required'; end if;
  select * into current_row from public.ideas where id=target for update;
  if not found then raise exception 'Innovation not found'; end if;
  if request_key is not null and exists(select 1 from public.idea_status_history h where h.idea_id=target and h.request_key=innovation_transition.request_key) then return current_row; end if;
  if current_row.status<>expected_status then raise exception 'Innovation changed since it was opened. Refresh and try again.'; end if;
  if next_status<>current_row.status and not (
    (current_row.status='submitted' and next_status='under_review') or
    (current_row.status='under_review' and next_status in ('approved','rejected')) or
    (current_row.status='approved' and next_status='in_progress') or
    (current_row.status='in_progress' and next_status='implemented')
  ) then raise exception 'Invalid innovation status transition: % -> %', current_row.status, next_status; end if;
  if next_priority is not null and next_priority not in ('low','medium','high','critical') then raise exception 'Invalid priority'; end if;
  if next_progress is not null and (next_progress<0 or next_progress>100) then raise exception 'Progress must be between 0 and 100'; end if;
  if next_status='rejected' and char_length(trim(coalesce(decision_note,'')))<5 then raise exception 'A rejection reason is required'; end if;
  if next_owner is not null and not exists(select 1 from public.profiles p where p.id=next_owner and p.status='active' and coalesce(p.is_employee,true) and coalesce(p.workforce_visible,true)) then raise exception 'Owner must be an active employee'; end if;
  if task_link is not null and not exists(select 1 from public.tasks task where task.id=task_link and (public.has_permission('tasks.assign') or exists(select 1 from public.task_assignments a where a.task_id=task.id and a.profile_id=actor))) then raise exception 'Task is not accessible'; end if;
  if next_status in ('approved','in_progress','implemented') and not public.has_permission('innovation.manage') then raise exception 'Innovation manage permission required'; end if;

  update public.ideas set
    status=next_status,
    priority=coalesce(next_priority,priority),
    owner_id=coalesce(next_owner,owner_id),
    reviewer_id=actor,
    target_date=coalesce(next_target_date,target_date),
    progress_percent=case when next_status='implemented' then 100 else coalesce(next_progress,progress_percent) end,
    decision_notes=coalesce(nullif(trim(decision_note),''),decision_notes),
    implementation_note=coalesce(nullif(trim(implementation_text),''),implementation_note),
    linked_task_id=coalesce(task_link,linked_task_id),
    approved_at=case when next_status='approved' then now() else approved_at end,
    implemented_at=case when next_status='implemented' then now() else implemented_at end,
    implemented_by=case when next_status='implemented' then actor else implemented_by end,
    rejected_at=case when next_status='rejected' then now() else rejected_at end,
    lock_version=lock_version+1,
    updated_at=now()
  where id=target returning * into updated_row;

  event_name := case when next_status<>current_row.status then next_status else 'workflow_updated' end;
  insert into public.idea_status_history(idea_id,previous_status,new_status,event_type,reason,changed_by,before_data,after_data,request_key)
  values(target,current_row.status,updated_row.status,event_name,coalesce(decision_note,implementation_text),actor,to_jsonb(current_row),to_jsonb(updated_row),request_key);
  insert into public.idea_activity_logs(idea_id,action_type,actor_employee_id,metadata)
  values(target,event_name,actor,jsonb_build_object('status',updated_row.status,'priority',updated_row.priority,'owner_id',updated_row.owner_id,'progress',updated_row.progress_percent));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
  values(actor,'innovation_'||event_name,'ideas',target,to_jsonb(current_row),to_jsonb(updated_row));

  notification_type := 'innovation_'||event_name;
  if next_status<>current_row.status and not exists(select 1 from public.notifications n where n.profile_id=updated_row.submitted_by and n.type=notification_type and n.related_entity_id=target) then
    perform public.notify_user(updated_row.submitted_by,'Innovation '||replace(next_status,'_',' '),updated_row.title,notification_type,target,'/employee/innovation/'||target,actor,'innovation',case when next_status='rejected' then 'high' else 'normal' end,'none',false,jsonb_build_object('innovation_id',target,'event_key',event_name));
  end if;
  if updated_row.owner_id is not null and updated_row.owner_id is distinct from current_row.owner_id and not exists(select 1 from public.notifications n where n.profile_id=updated_row.owner_id and n.type='innovation_owner_assigned' and n.related_entity_id=target) then
    perform public.notify_user(updated_row.owner_id,'Innovation assigned',updated_row.title,'innovation_owner_assigned',target,'/employee/innovation/'||target,actor,'innovation','high','standard',true,jsonb_build_object('innovation_id',target,'event_key','owner:'||updated_row.owner_id));
  end if;
  return updated_row;
end $$;
revoke all on function public.innovation_transition(uuid,text,text,text,uuid,date,integer,text,text,uuid,text) from public, anon;
grant execute on function public.innovation_transition(uuid,text,text,text,uuid,date,integer,text,text,uuid,text) to authenticated;

create or replace function public.innovation_summary()
returns table(status text,total bigint) language sql stable security invoker set search_path=public as $$
  select ideas.status,count(*) from public.ideas group by ideas.status
$$;
revoke all on function public.innovation_summary() from public, anon;
grant execute on function public.innovation_summary() to authenticated;

notify pgrst, 'reload schema';
