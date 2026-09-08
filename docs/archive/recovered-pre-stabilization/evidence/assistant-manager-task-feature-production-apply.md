# Assistant Manager task feature — production apply record

- **Applied:** 2026-08-19
- **Production project:** `ksmqzxncdvuxiabypjth` (`bsmile`)
- **Source migration:** `supabase/migrations/20260819100000_assistant_manager_meeting_create_and_task_delete.sql`
- **Application method:** executed directly as one explicit transaction in the Supabase SQL Editor.

The migration was applied directly because the production project's historical Supabase migration metadata has not yet been reconciled. No `supabase db push`, migration replay, migration repair, or migration-history change was used.

The first transaction was rejected by PostgreSQL before execution because the original SQL used `grant` as an alias, which is a reserved keyword. The migration was corrected to use `permission_grant` and the full transaction was then applied successfully.

Post-apply production verification confirmed that the active Staff profile designated Assistant Manager retains `staff`, has `tasks.assign` and `meetings.create`, the `delete_managed_task(uuid)` RPC exists with `SECURITY DEFINER` and `search_path=public`, execution is granted to `authenticated` only, and the tasks table has no direct DELETE policy.

## Appointment & Scheduling follow-up

- **Applied:** 2026-08-19
- **Source migrations:**
  - `supabase/migrations/20260819110000_assistant_manager_doctor_scheduling_access.sql`
  - `supabase/migrations/20260819110100_assistant_manager_scheduling_patient_visibility.sql`
- **Application method:** executed directly as explicit transactions in the same production SQL Editor because migration history remains unreconciled.

Active Staff designated `Assistant Manager` receive `doctor_scheduling.view`, `doctor_scheduling.create_appointments`, `doctor_scheduling.update_appointments`, and `doctor_scheduling.cancel_appointments`. `doctor_scheduling.manage_doctors` is intentionally excluded. `patients.view_all` is granted only because existing appointment RLS requires patient visibility for the appointment list and patient picker; it does not grant patient creation, editing, or assignment.


