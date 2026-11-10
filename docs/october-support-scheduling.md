# Scheduling availability qualification

The scheduling page generates candidate slots using appointment rows visible to the caller. Existing RLS limits appointment visibility by patient access. A scheduler can therefore fail to see another client's conflicting booking, while the database's `doctor_slot_is_available` function checks all conflicts. The UI can offer a slot that the create RPC subsequently rejects as unavailable. This discrepancy is reproduced by the regression test; it has not been proven to explain any particular October incident.

For each generated candidate, the client now requests the existing database availability check and displays only a positive result. No patient or appointment details are returned by that check. A database or permission error fails closed and produces an error instead of presenting the doctor as unavailable. Date and clinician changes discard stale asynchronous results. The existing creation RPC and overlap constraint remain the final concurrency guard.

Before release, verify the exact production function signature and EXECUTE privileges for every scheduling role, and reproduce the reported doctor/date/time using read-only availability and conflict checks. Qualify latency and mobile/desktop behavior on a protected non-production deployment. Do not make a test booking in Production.

Rollback is a code-only revert of this change followed by the normal reviewed release process; there is no database migration or data rewrite. Reverting restores the previous risk of displaying slots conflicting with bookings hidden by RLS.
