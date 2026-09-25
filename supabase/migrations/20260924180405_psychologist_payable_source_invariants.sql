-- Manual payments share the payable table but may omit appointment/session
-- details. Restore every historical automatic-row NOT NULL invariant with a
-- source-aware constraint, and keep manual rows explicitly session-free.
alter table public.psychologist_session_payables
  add constraint psychologist_session_payables_source_fields_check
  check (
    (
      source = 'automatic'
      and appointment_id is not null
      and session_date is not null
      and session_completed_at is not null
      and session_record_submitted_at is not null
      and psychologist_rate is not null
      and payment_cycle_type is not null
    )
    or
    (
      source = 'manual'
      and appointment_id is null
      and session_date is null
      and session_completed_at is null
      and session_record_submitted_at is null
      and psychologist_rate is null
      and payment_cycle_type is not null
      and payment_cycle_type = 'manual'
      and due_date is not null
      and created_by is not null
    )
  );
