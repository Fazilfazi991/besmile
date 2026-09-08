revoke execute on function public.complete_task_assignment(uuid, text) from public, anon;
revoke execute on function public.complete_managed_task(uuid, text) from public, anon;

grant execute on function public.complete_task_assignment(uuid, text) to authenticated;
grant execute on function public.complete_managed_task(uuid, text) to authenticated;
