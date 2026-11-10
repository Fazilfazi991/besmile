# October support: proposed staff grants

This is a **release-only proposal**, not an automatically applied migration. The SQL must not be run until current Production identity, account state, permissions, approval, and rollback are reviewed. The October 20 snapshot is historical evidence, not proof of current identity or access.

The employee Leave navigation and route require one of `leave.self`, `leave.request`, `leave.view`, `leave.manage`, or `leave.approve`; existing database policies independently restrict leave requests to the eligible employee. The proposal adds only `leave.request` for the previously identified Fatima KR account.

The existing client-conversion function requires both `leads.convert_to_patient` and `patients.create`; existing lead access and eligibility checks still apply. **`patients.create` can also authorize ordinary client creation**, so the business owner must explicitly review this wider effect before approving the proposed grants. Diya's historical grants already included `leads.edit` and `sales.edit`; active existing grants are retained rather than duplicated. This proposal does not grant broad Finance, invoice administration, employee management, or unrestricted management access.

The script verifies all three exact profile/Auth IDs, emails, names, operational flags and designations, including Fatima KR's recorded double space. It fails closed on drift and never edits profiles. The insertion is transaction-wrapped, retry-safe and adds only currently missing active direct grants, with a distinguishing reason for audit and rollback. It must be preceded by fresh read-only Production review, including any role or bundle permissions and API/Jeenie behavior. A separate workstream owns narrow payment authorization.

Rollback after approved execution: review the exact rows inserted during release, then revoke only active `user_permission_grants` rows carrying reason `Approved October support scoped staff access`; retain unrelated pre-existing rows and ordinary audit records. Do not delete grants or mutate employee profiles to roll back.

The proposal alone does not establish the root cause of any reported incident or prove that live leave, conversion, payment, correction or Jeenie workflows work. These require current authorized accounts, verified business records, policy inspection, and isolated end-to-end acceptance checks before release.
