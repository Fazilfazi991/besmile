-- Complete the SECURITY DEFINER execute-grant boundary. Policy and read helpers
-- remain callable by authenticated sessions; trigger functions are never API RPCs.
do $$
declare
  function_signature text;
  authenticated_helpers constant text[] := array[
    'public.announcement_manager_can_manage(uuid)', 'public.appointment_patient_access(text,uuid)',
    'public.business_timezone()', 'public.business_today()', 'public.can_manage_admin()',
    'public.can_manage_task_assignment(uuid,uuid)', 'public.company_document_can_read(uuid)',
    'public.crm_can_manage(uuid)', 'public.crm_lead_can_edit(uuid)',
    'public.crm_lead_can_view(uuid,uuid)', 'public.crm_lead_can_view(uuid)',
    'public.crm_sale_access(uuid)', 'public.crm_sale_can_edit(uuid)', 'public.crm_sale_can_view(uuid)',
    'public.current_role()',
    'public.doctor_slot_is_available(uuid,timestamp with time zone,timestamp with time zone,uuid)',
    'public.document_manager_can_manage(uuid)', 'public.idea_is_visible(uuid)',
    'public.in_management_tree(uuid)', 'public.is_chat_member(uuid)', 'public.is_management()',
    'public.is_super_admin(uuid)', 'public.patient_access(uuid)',
    'public.patient_document_access(public.patient_documents)', 'public.patient_is_assigned(uuid,uuid)',
    'public.policy_audience_matches(uuid,uuid)', 'public.policy_document_visible(uuid,boolean)',
    'public.profile_can_operationally_edit(uuid)', 'public.role_has_permission(public.app_role,text)',
    'public.task_manager_can_manage(uuid)', 'public.task_visible_to_current_user(uuid)'
  ];
  trigger_signatures constant text[] := array[
    'public.assign_chat_message_expiry()', 'public.enforce_attendance_workday()',
    'public.enforce_employee_status_change()', 'public.enforce_profile_self_update()',
    'public.enforce_task_assignment_update()', 'public.finance_prevent_overpayment()',
    'public.notify_selected_announcement_recipient()', 'public.notify_task_assignment()',
    'public.notify_task_update()', 'public.prepare_chat_message_channel()'
  ];
begin
  foreach function_signature in array authenticated_helpers loop
    if to_regprocedure(function_signature) is not null then
      execute format('revoke execute on function %s from public, anon', function_signature);
      execute format('grant execute on function %s to authenticated', function_signature);
    end if;
  end loop;
  foreach function_signature in array trigger_signatures loop
    if to_regprocedure(function_signature) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', function_signature);
    end if;
  end loop;
end
$$;
notify pgrst, 'reload schema';
