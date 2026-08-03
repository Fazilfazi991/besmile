-- Repair existing payroll run period-end timezone drift and all-paid run status.
update public.payroll_runs
set period_end = (date_trunc('month', period_start)::date + interval '1 month - 1 day')::date
where period_start is not null
  and period_end is distinct from (date_trunc('month', period_start)::date + interval '1 month - 1 day')::date;

update public.payroll_runs run
set status = 'paid'
where status <> 'paid'
  and exists (
    select 1 from public.payroll_entries entry
    where entry.payroll_run_id = run.id
  )
  and not exists (
    select 1 from public.payroll_entries entry
    where entry.payroll_run_id = run.id
      and entry.payment_status <> 'paid'
  );
