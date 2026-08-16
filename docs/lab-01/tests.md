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

```bash
cd server && npm test    # API-01, API-02
cd client && npm test    # UI-01, UI-02, UI-03
```

## Evidence

Paste your terminal output (or a screenshot) of both `npm test` runs showing all
tests passing here before submitting the PDF.

```
(paste server `npm test` output here)
```

```
(paste client `npm test` output here)
```
