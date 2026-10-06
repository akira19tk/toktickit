# Lab 3 — AI Use Report

How AI coding tools were used to build TokTickIT Lab 3 (Users, Roles, IT Staff
Ticketing, and Admin), including the prompts that drove the work and the places
where the agent was wrong and how that was caught.

## 1. Tools used

- **Claude (claude.ai chat, Opus)** — planner and reviewer. It wrote the prompts
  given to Claude Code, reviewed every agent answer before anything was run, and
  decided what to accept.
- **Claude Code (Anthropic Claude, Opus)** — the coding agent. It wrote and edited
  the server, client and test code from those prompts.
- **The author** ran all server, database and Playwright commands.

The project stack the agent worked within: TypeScript, Express 5 + Prisma
(PostgreSQL) on the server, React + Vite on the client, Vitest for unit/API tests
and Playwright (Chromium) for E2E; Git for version control (the commit hashes
referenced below are from `git log`).

## 2. Key prompts and what happened

1. **"Build the Lab 3 auth foundation: Prisma schema + migration, seed, and the
   auth API (login, logout, me, change-password) with session cookies, bcrypt,
   CSRF and CORS allow-list."**
   Produced the session-auth API and its tests (`c166acb`, API-01..15, API-70).

2. **"Convert the Lab 2 routes and tests to session authentication and remove the
   old `x-requester-id` / Development Requester mechanism."**
   Migrated the requester ticket routes to the session identity and deleted the
   dev-requester selector (`9237733`, BR-61).

3. **"Build the IT Staff ticket detail: claim, reassign, IT priority, status
   workflow, public comments and internal notes."**
   Landed the staff detail API and workflow (`521a649`, API-43..54, 64, 67, 69).
   Concurrency (two simultaneous claims) exposed the transaction bug in §3 below.

4. **"Build Administrator user management with the last-active-Administrator
   safety rule, enforced atomically under concurrent requests."**
   Produced the admin users API with a transaction-scoped advisory lock
   (`8e09603`, API-55..63, 65). The advisory-lock call was wrong on the first
   pass — see §3.

5. **"Make `tsc` build cleanly and make the built server actually run."**
   Fixed node16 module resolution, the start path, and a `uuid` import that was
   replaced with `crypto.randomUUID` (`04cc5fb`). This is also why `uuid` and
   `@types/uuid` were later dropped from `server/package.json` — nothing imported
   them anymore.

6. **"Stand up a Playwright harness that is fully isolated from the dev stack:
   its own `toktickit_e2e` database, its own ports, and setup/seed scripts that
   refuse to touch the dev or `_test` databases."**
   Produced `playwright.config.ts` (API 4100, client preview 4173) and the
   `_e2e`-guarded setup/seed scripts.

7. **"Write the E2E specs for authentication, the requester and staff ticket
   flows, and administrator user management, keyed to the E2E IDs in tests.md."**
   Produced `authentication.spec.ts`, `staff-ticket-flow.spec.ts` and
   `user-administration.spec.ts` (`a727a4f` and follow-ups). Flaky selectors and a
   login race surfaced here — see §3.

8. **"Add responsive and visual-style E2E (RESP-01..05, STYLE-01) that assert real
   layout — no horizontal overflow, tables becoming cards, dialogs fitting the
   viewport — and capture screenshots at mobile/tablet/desktop."**
   Produced `responsive.spec.ts` with shared login helpers that wait for the
   landing screen (`f42bd65`). Screenshots are viewport-only so each image shows
   what a user sees on that device.

## 3. Where the agent was wrong, and how it was caught

Mistakes were caught three ways: failing tests, manual browser testing, and
reviewing the agent's proposal before accepting it.

1. **Session-ended banner shown instead of Not Found (`c9815f9`).** Caught by
   manual browser testing: after a voluntary Logout, opening `/abc` showed the
   Login page with "Your session has ended" instead of the Not Found page. The
   agent's first fix registered the 401 handler only on a successful probe;
   review caught that this broke BR-66 for anyone who signs in through the form.
   New integration tests then exposed two real bugs: the probe re-ran on every
   navigation, and the guard's redirect dropped the banner.

2. **Ticket-claim hang (`521a649`).** Caught by a failing test: API-64 (two
   simultaneous claims) timed out. The fix became one conditional `UPDATE`;
   review then caught a race — the status was checked in a separate read — fixed
   by adding the status to the `UPDATE`'s `WHERE` clause.

3. **Advisory lock and API-65 (`8e09603`).** API-65 failed once with `ECONNRESET`.
   The agent changed the working `$executeRaw` to `$queryRaw`, which broke three
   tests because the advisory-lock function returns `void`; review caught it and
   it was reverted, keeping a `try`/`catch` that logs. The real API-65 result was
   `[200, 401]`: the loser was deactivated before its auth check. The test was
   rewritten to assert the true invariant (one 200; the other 409 `LAST_ADMIN` or
   401; exactly one active Administrator).

4. **Create Ticket select (`a727a4f`).** E2E-03 failed with "Category is
   required". The agent proposed a `toPass` retry loop; review rejected it as a
   retry that could hide an app bug. The agent then showed from the code that
   loading never resets the form, and the test now waits for the option before
   selecting once.

5. **Login race (`f42bd65`).** RESP-04 failed; the Playwright screenshot showed
   the Login page. All specs now share helpers that wait for the landing page.

**Found by manual browser testing, not by tests:**

- the Forbidden page rendering outside the app shell (`8d4c764`);
- the queue summary not truncating, so the requester-resolved marker was off
  screen (`498121a`);
- the "Set new initial password" button invisible, white on white (`9bb7f98`);
- the success toast lost when the dialog closed (`9bb7f98`).

**Contract gaps found and fixed in the docs:**

- the `requesterResolved` filter (BR-57);
- the status-check order (BR-24).

## 4. My Reflection

_To be written by the author._
