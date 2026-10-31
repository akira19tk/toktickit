# Lab 4 hardening (#56 / #57)

Branch: `feature/lab4-hardening`, based on latest `lab4-staging` at work start.
The owner authorized one branch/PR for both issues. No browser verification; E2E runs once at the end.

## Dependency audit (2026-11-01 Asia/Bangkok)

`npm audit fix` (no force) applied independently to root, client and server. Root and client: zero
vulnerabilities. Removed unused `ts-node`, `ts-node-dev`, and obsolete `@types/bcryptjs` from server
(the project runs TS with `tsx`; bcryptjs ships its own types). This removes the old rimraf/glob chain.
Server remaining: 3 high findings (`prisma` → `@prisma/config` → `deepmerge-ts`), one underlying
recursive-object stack-exhaustion advisory GHSA-ggr8-5vv4-36mx. npm proposes Prisma 7.10.1, a breaking
major upgrade. Kept Prisma 6; record this accepted upgrade limitation for #42 rather than force it.
These are CLI/config tooling dependencies; do not treat this as a claim that all production risk is zero.

## Flake investigation and changes

- #39: UI-03 resolved its pending create promise outside React `act`, without awaiting success.
  Now resolve inside awaited `act` and assert the success ticket number.
- #41: initial baseline client run had a 5s workflow timeout under parallel jsdom load, then passed
  in isolation. Serialize client files using ordinary fork workers; use supported Node 24.22.1 for checks.
- API-40: DB files were already sequential. Preserve that setting, explicitly cap workers at one,
  and disconnect the Prisma pool after every file (several newer suites lacked teardown).
- #40/API-65: retain the real overlapping requests and strict one-winner/one-rejection invariant;
  no retries or weakened assertions. The existing server transaction/error handler is retained.
  API test/hook budgets are 15s/30s to accommodate real database work under load. A single green final
  run can confirm this run, but cannot prove the historical socket reset can never recur.
- Complete UNIT-L4-04 with fixed Bangkok-midnight, year-rollover and leap-year boundaries.

## Cleanup

No tracked or untracked iCloud ` 2` duplicates found outside dependency/Git directories, and
`e2e/lab-03 2/` is already absent. No deletion was invented. Source scan found no client console calls
or unfinished TODO controls. Normal field hints are retained. Backend error logs remain intentional.
`.gitignore` covers dependencies, environment secrets, build output, uploads and generated test reports.

## Final validation

Final results (Node 24.22.1), logs in `test-output/hardening-*`:

| Check | Result |
|---|---|
| Server API/unit Labs 1–4 | 544 passed, 22 files (`hardening-server-final.txt`) |
| Migration Labs 3–4 | 46 passed, 2 files (`hardening-migration.txt`) |
| Client Labs 1–4 | 127 passed, 21 files; no act warnings (`hardening-client.txt`) |
| Client build / lint | Pass |
| Server build | Pass after fixing CJS-incompatible import.meta in spec-table test and explicit .js extension in teardown dynamic import |
| E2E, original agent attempt | Historical: 3 passed, 33 blocked at Chromium startup |
| E2E, student local Terminal follow-up | **36 passed (46.2s)**, `hardening-e2e-local-terminal.txt` |

The initial server build failure is preserved in `hardening-server-build.txt`; the corrected build
is in `hardening-server-build-fixed.txt`. Only server tests were repeated after those source corrections;
unchanged client and migration suites were not repeated. Full machine-readable step history is in
`hardening-results.json`.

**E2E environment blocker:** Chromium exits with SIGTRAP before a page opens:
`bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer: Permission denied (1100)`.
This was an OS process-permission failure before application assertions. The agent did not rerun E2E.
The student subsequently ran `npm run e2e:setup && npm run e2e` in local Terminal: **36 passed (46.2s)**.
The student-supplied output is retained with personal shell prompts removed; it contains test results,
local test ports and fixture descriptions, not credentials. Local Playwright last-run status also
reports passed with no failed tests. E2E Node version was not recorded; other checks used Node 24.22.1.
The original blocked output remains as history alongside the successful follow-up in the step manifest.

Refreshed Lab 3/4 screenshots come from isolated E2E fixtures. Screenshot code captures test accounts
(example.com addresses) and synthetic tickets, with no typed password shown. Representative user-list
and action-form images were inspected for sensitive content before publication. This privacy check
was not a manual UI/accessibility certification; no browser verification was performed by the agent.
Passing responsive tests measure no-overflow at 375/850/1440. Release/main validation follows review.


## Release-main evidence update

Release commit `a92fa7d` was validated after PR #66 merged: server 544, migration 46, client 127,
student local Terminal E2E 36 (41.1s), and builds/lint passed. Logs and provenance are in
`test-output/main/`; `docs/lab-04/tests.md` section 6 is the submission index. This supersedes earlier
statements that main validation was pending; historical branch results above remain labeled separately.
Application/test/dependency files are unchanged through documentation merge `17b2ce1`.
