# Production smoke-test checklist

Run using one Super Admin and one ordinary active employee. Record pass/fail, timestamp, and the error reference without recording credentials or sensitive data.

| Area | Expected result | Rollback/restriction trigger |
| --- | --- | --- |
| Login/logout | Correct role lands in correct workspace; logout clears access | Login loop, cross-user session, inactive user access |
| Super Admin/access | Admin can open roles/access and effective permissions work | Any non-admin receives admin access or Super Admin is locked out |
| Employee dashboard/navigation | All visible links render with no server error | Broken shell, 404, or uncontrolled error |
| Attendance | Clock-in/out records correct day/time and employee sees own data | Wrong date/user record or RLS failure |
| Leave | Employee submits; reviewer can approve/reject; status updates | Insert/review failure or cross-employee visibility |
| Tasks | Assignee updates own status; scoped manager can assign team only | GM can access unrelated task or staff can manage others |
| Documents | Recipient uploads/downloads through signed URL | Public private document, unauthorized download/upload |
| Announcements/notifications | Targeting, read state, and deep links work | Wrong audience sees private announcement/notification |
| Chat | Members can message and access attachments only in their conversation | Cross-conversation access or public attachment URL |
| CRM | Assigned lead/follow-up/sale flows work; INR is shown | Wrong lead visibility or conversion failure |
| Finance | Income/expense, receipt, invoice payment and totals work | Incorrect ledger, overpayment accepted, receipt authorization failure |
| Payroll | Authorized user creates/marks paid run with ledger linkage | Duplicate/incorrect posting or unauthorized access |
| Reports/mobile | Reports load; navigation works at mobile width | Broken export/print or horizontal mobile lock-up |

Immediately restrict the affected route and use the rollback plan if a security isolation, ledger/payment, payroll, or storage authorization failure occurs.
