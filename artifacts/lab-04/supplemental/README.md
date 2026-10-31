# Supplemental submission evidence

Captured 2026-11-01 on isolated `toktickit_e2e`; no dev data was modified. Application/test behavior unchanged. These are targeted evidence scenarios, not another full regression run.

- `two-staff-one-ticket.jpg`: ticket TKT-2026-265251 has two completed actions performed by Staff E2E and Second Staff E2E. Both actions were created through authenticated API sessions for the corresponding actors.
- `inactive-assignee-rejected.jpg`: the form loaded an active assignee, who was temporarily made inactive before Save Action. The real UI rejected the stale selection; `inactive-assignee-api.json` independently records status 422/code ASSIGNEE_INACTIVE. Second Staff E2E was restored active afterwards.
- `staff-dashboard-matched.jpg` and `dashboard-sql.json`: same database/user snapshot, with no data writes between UI capture and direct SQL read. All 7 displayed counts match: 4/18/3/0/23/4/3. Captured before later resolution of the evidence ticket; do not compare it to the database after that mutation.
- `dashboard-drilldown.jpg`: In Progress card navigated to queue with status=IN_PROGRESS and 3 matching tickets.
- `resolve-selected.jpg` and `resolve-success.jpg`: permitted RESOLVED target and subsequent successful resolution after both Actions were completed.
- `permitted-status-options.txt`: browser accessibility snapshot records all four valid targets from IN_PROGRESS (OPEN, WAITING_FOR_REQUESTER, RESOLVED, CANCELLED). The native popup is not captured by page screenshots; no artificial dropdown image was made.
- `final-state.json`: confirms two completed Actions with different performers, RESOLVED ticket and restored active assignee.

Actual screenshot email addresses are synthetic example.com test fixtures. No passwords/session cookies were saved. Full manual accessibility auditing remains outside these captures.
