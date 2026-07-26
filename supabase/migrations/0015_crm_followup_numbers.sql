alter table public.crm_lead_followups
  add column if not exists followup_number integer;

alter table public.crm_lead_followups
  drop constraint if exists crm_lead_followups_followup_number_positive;

alter table public.crm_lead_followups
  add constraint crm_lead_followups_followup_number_positive
  check (followup_number is null or followup_number > 0);

create index if not exists crm_lead_followups_lead_number_idx
  on public.crm_lead_followups(lead_id, followup_number);
