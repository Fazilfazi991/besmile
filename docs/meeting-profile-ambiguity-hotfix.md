# Meeting/profile ambiguity hotfix

Base: cceb2d304fdc4893c8bbf8741ee1cc24a0c154e3.

## Confirmed Production schema and failures

Read-only PostgREST requests with limit=0 reproduced PGRST201 and returned both FK names:

- meeting_participants_employee_id_fkey: employee_id -> profiles.id
- meeting_participants_invited_by_fkey: invited_by -> profiles.id
- payroll_entries_profile_id_fkey: profile_id -> profiles.id
- payroll_entries_finalized_by_fkey: finalized_by -> profiles.id

The participant is employee_id, not invited_by. The payroll subject is profile_id, not finalized_by.
The deployed schema contains legitimate additional relationships; the canonical migration files do not describe all of these additions. No FK or RLS change is needed.

## Query/surface audit

| Query | Classification and correction |
| --- | --- |
| calendarMeetingRepository.myMeetings | Confirmed RISK; now explicitly uses meeting_participants_employee_id_fkey |
| calendarMeetingRepository.myCalendar | Uses myMeetings; receives the same fix |
| adminRepository.payrollRun | Confirmed RISK; now explicitly uses payroll_entries_profile_id_fkey |
| adminRepository.financeReport | Confirmed RISK; now explicitly uses payroll_entries_profile_id_fkey |
| crm_lead_followups profile embeds (admin/employee) | No ambiguity returned by Production limit=0 probe |
| chat_members profile embed | No ambiguity returned by Production limit=0 probe |
| daily_work_updates / chat_message_mentions | Anonymous probe denied; no PGRST201 returned, not a full authenticated schema audit |
| meetings organizer, CRM assignee, chat message sender | SAFE: explicit FKs |

Admin Meetings and Calendar re-export the employee implementations. Upcoming, past, cancelled, participant previews, detail and edit prefill all consume myMeetings. Meeting writes use existing save_meeting/cancel_meeting RPCs. The management dashboard's company-calendar card does not query participants.

The Supabase management connector denied catalog-query access. PostgREST itself supplied the exact ambiguous FK definitions; this audit does not claim a complete catalog inventory of every Production FK.

## Regression coverage

- Executable repository tests model employee_id and invited_by and assert participant names and Calendar mapping.
- Safe-error tests cover PGRST201 and sanitize logged context.
- Real QA probes query the explicit meeting/payroll relationships under authenticated RLS.
- Browser gate includes management/employee Meetings and Calendar at 390x844 and 1366x768.
- QA browser lifecycle creates a marked meeting, verifies participant detail, edits, checks Calendar data, then cancels via the supported UI (retained cancellation audit).

## Extended lifecycle contract repair

Authenticated QA PostgREST calls confirmed that the old save and cancel signatures return
PGRST202. Adding the canonical arguments resolves each RPC and reaches validation.
Normal QA lifecycle probes successfully create, read, edit and cancel with these signatures:

- save_meeting(target_meeting uuid, meeting_title text, meeting_agenda text,
  meeting_start timestamptz, meeting_end timestamptz, meeting_type_value text,
  meeting_venue text, meeting_url_value text, meeting_description text,
  host_profile_id uuid, participant_ids uuid[]) returns uuid.
- cancel_meeting(target_meeting uuid, cancel_reason text) returns uuid.

Canonical implementation reference: commit 3cf890b410d75ac109c9e8232481dc0bd551adb8,
supabase/migrations/20260904103546_restore_meetings_minutes.sql.
Direct catalog access was denied; no claim is made about inaccessible overloads.
The former 10-argument save and one-argument cancel are absent from QA's exposed API.
No migration or RLS changes are part of this repair.

Host choices come from meeting_hosts(), not hard-coded roles or user IDs. The current
profile is selected only if returned as an authorized host; otherwise explicit selection
is required. Edit retains host_user_id. The database remains authoritative for permission
checks. Agenda/title need at least two trimmed characters; cancellation needs three.
Cancellation goes through the existing transactional RPC, retaining the reason on the
meeting and in its canonical event/audit mechanism.

The permanent QA probe verifies selected host, agenda, participant linkage, management
edit/cancel, employee participation, and explicit 42501 denial of employee/anonymous
lifecycle mutations. Disposable meetings are cancelled through the supported RPC,
not deleted; their marked audit records remain available.

The original employee-denial trace records successful password login (200), dashboard
redirect (307), dashboard response (200), then an admin route redirect to sign-in (307).
This does not establish rejected credentials or an authorization-policy regression.
Unchanged isolated employee-denial runs passed repeatedly on mobile and on desktop.
No auth, middleware, cookie or fixture change was made. The original one-off failed
server-side user lookup cannot be attributed more precisely from the browser trace.

Two former repository-wide assertions rejected the word "reason" even in the required
cancellation API. They now scope that assertion to availability, with an additional
executable test proving private reasons, notes and titles are stripped from conflicts.

## Follow-up

Expand the client-visible route/role matrix beyond these meeting routes. Existing smoke assertions that merely check a generic visible container do not prove a module's data loaded. Each route should assert its specific loaded state and successful backend responses.
