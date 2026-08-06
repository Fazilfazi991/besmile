-- Update only user-facing Innovation Hub notification wording.
create or replace function public.notify_idea_comment()
returns trigger language plpgsql security definer set search_path=public as $$
declare owner uuid;
declare parent_author uuid;
begin
 insert into public.idea_activity_logs(idea_id, action_type, actor_employee_id, metadata) values(new.idea_id, case when new.is_official_response then 'official_response_added' else 'comment_added' end, new.author_employee_id, jsonb_build_object('comment_id', new.id, 'parent_comment_id', new.parent_comment_id));
 select submitted_by into owner from public.ideas where id=new.idea_id;
 if owner is not null and owner is distinct from new.author_employee_id then
   perform public.notify_user(owner, 'New comment on your idea', 'Someone commented on your Innovation Hub submission.', 'idea_comment', new.idea_id, '/employee/ideas/'||new.idea_id, new.author_employee_id);
 end if;
 if new.parent_comment_id is not null then
   select author_employee_id into parent_author from public.idea_comments where id=new.parent_comment_id;
   if parent_author is not null and parent_author is distinct from new.author_employee_id and parent_author is distinct from owner then
     perform public.notify_user(parent_author, 'New reply on an idea', 'Someone replied to your Innovation Hub comment.', 'idea_reply', new.idea_id, '/employee/ideas/'||new.idea_id, new.author_employee_id);
   end if;
 end if;
 return new;
end $$;

create or replace function public.log_idea_support()
returns trigger language plpgsql security definer set search_path=public as $$
declare owner uuid;
begin
 if TG_OP='INSERT' then
   insert into public.idea_activity_logs(idea_id, action_type, actor_employee_id, metadata) values(new.idea_id, 'support_added', new.employee_id, '{}'::jsonb);
   select submitted_by into owner from public.ideas where id=new.idea_id;
   if owner is not null and owner is distinct from new.employee_id then
     perform public.notify_user(owner, 'Someone liked your idea', 'Your idea received a like', 'idea_liked', new.idea_id, '/employee/ideas/'||new.idea_id, new.employee_id);
   end if;
   return new;
 else
   insert into public.idea_activity_logs(idea_id, action_type, actor_employee_id, metadata) values(old.idea_id, 'support_removed', old.employee_id, '{}'::jsonb);
   return old;
 end if;
end $$;
