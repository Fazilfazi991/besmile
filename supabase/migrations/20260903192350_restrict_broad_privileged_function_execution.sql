-- Remove implicit anonymous execution from privileged business RPCs and
-- trigger-only functions. Callable workflows remain available to authenticated
-- users and continue to enforce their existing in-body authorization checks.

do $$
declare
  function_signature text;
  callable_signatures constant text[] := array[
    'public.appointment_has_permission(text)',
    'public.create_doctor_appointment(uuid,uuid,timestamp with time zone,timestamp with time zone,text,text)',
    'public.update_doctor_appointment(uuid,uuid,timestamp with time zone,timestamp with time zone,text,text,text)',
    'public.update_doctor_appointment_status(uuid,text,text)',
    'public.reschedule_doctor_appointment(uuid,timestamp with time zone,timestamp with time zone,text)',
    'public.delete_doctor_appointment(uuid,text)',
    'public.create_or_get_direct_chat(uuid)',
    'public.create_group_chat(text,text,text,uuid[])',
    'public.manage_group_chat_member(uuid,uuid,text)',
    'public.record_expired_task_permissions()'
  ];
  trigger_signatures constant text[] := array[
    'public.audit_permission_grant_event()',
    'public.audit_row()',
    'public.audit_task_assignment_event()',
    'public.enforce_leave_request_lifecycle()',
    'public.finance_audit_event()',
    'public.finance_invoice_payment_ledger()',
    'public.finance_refresh_invoice_status()',
    'public.log_idea_support()',
    'public.notify_announcement_publish()',
    'public.notify_crm_lead_assignment()',
    'public.notify_document_event()',
    'public.notify_idea_comment()',
    'public.notify_onboarding_owner()',
    'public.patient_action_activity_event()',
    'public.patient_activity_event()',
    'public.profile_operational_activity_event()',
    'public.record_employee_status_change()'
  ];
begin
  foreach function_signature in array callable_signatures loop
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
