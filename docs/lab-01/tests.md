# Lab 1 — Automated Test Evidence

All tests required by the Lab 1 specification, their location, and what they verify.

| Test ID | File | Tool | Description |
|---|---|---|---|
| API-01 | `server/tests/lab-01/health.test.ts` | Supertest | `GET /api/health` returns HTTP 200 with `{ status: "ok", service: "TokTickIT API" }` |
| API-02 | `server/tests/lab-01/categories.test.ts` | Supertest | `GET /api/categories` returns the four seeded categories in a predictable order |
| UI-01 | `client/tests/lab-01/heading.test.tsx` | Vitest + React Testing Library | The "TokTickIT" heading renders on load |
| UI-02 | `client/tests/lab-01/checkSystemSuccess.test.tsx` | Vitest + React Testing Library | Clicking Check System shows a loading state, then Online status and the category list |
| UI-03 | `client/tests/lab-01/checkSystemFailure.test.tsx` | Vitest + React Testing Library | A failed API call shows "Offline" and a useful error message |

## How to run

    cd server && npm test    # API-01, API-02
    cd client && npm test    # UI-01, UI-02, UI-03

## Evidence

Server test run (2026-08-16):

    tests/lab-01/health.test.ts (1 test) - PASSED
    tests/lab-01/categories.test.ts (1 test) - PASSED
    Test Files  2 passed (2)
    Tests  2 passed (2)

Client test run (2026-08-16):

    tests/lab-01/heading.test.tsx (1 test) - PASSED
    tests/lab-01/checkSystemSuccess.test.tsx (1 test) - PASSED
    tests/lab-01/checkSystemFailure.test.tsx (1 test) - PASSED
    Test Files  3 passed (3)
    Tests  3 passed (3)

All 5 required tests pass on both lab1-staging and main after peer review and merge.
