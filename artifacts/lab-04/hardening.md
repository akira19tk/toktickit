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
| E2E, exactly one invocation | 3 passed; 33 blocked at Chromium startup, reported as failed by Playwright |

The initial server build failure is preserved in `hardening-server-build.txt`; the corrected build
is in `hardening-server-build-fixed.txt`. Only server tests were repeated after those source corrections;
unchanged client and migration suites were not repeated. Full machine-readable step history is in
`hardening-results.json`.

**E2E environment blocker:** Chromium exits with SIGTRAP before a page opens:
`bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer: Permission denied (1100)`.
This is an OS process-permission failure, not an application assertion. No rerun performed, per the
owner's one-run instruction. Browser scenarios and refreshed screenshots remain unverified; existing
screenshots are prior evidence, not proof of this branch. Run E2E in an environment allowing Chromium
startup before merging/releasing. This branch is not certified fully green.
No manual browser/visual checks performed. CSS layout and existing responsive tests provide partial
coverage only; do not claim measured no-overflow at every width. Release/main validation follows review.
