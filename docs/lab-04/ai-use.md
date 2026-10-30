# Lab 4 — AI Use Report

> **Template.** Grading Part 4 wants the LLM(s) named, **6–10 selected key prompts**, and a short
> "My Reflection" on specification-agent and coding-agent use. Fill the prompts in with the real commit
> hashes / PR numbers as the work lands; keep prompts representative (not every message), and note where the
> agent was wrong and how it was caught.

## 1. Tools used

- **Claude (claude.ai chat, Opus)** — specification agent / planner / reviewer: turned the handout into the
  Sprint 4 engineering contract, resolved ambiguities with the author, and reviewed agent output before it
  was run.
- **Claude Code (Opus)** — coding agent: wrote and edited server, client, and test code from approved
  prompts.
- **The author** ran all server, database, migration, and Playwright commands and decided what to accept.

Stack: TypeScript, Express 5 + Prisma (PostgreSQL), React 19 + Vite, Vitest (unit/API), Playwright (E2E),
Git. Commit hashes below are from `git log`.

## 2. Key prompts and what happened

1. **"Act as my specification agent. List every handout ambiguity/contradiction first, then draft
   `docs/lab-04/specification.md` with sections 1–11."**
   Surfaced the Actions-Taken-assignee/status gap, the §4.3-vs-§8.3 Requester-visibility conflict, the
   deferred resolution gate, and the Admin-write conflict; the author decided each, and the spec was written
   accordingly (`e434819`).

2. **"Refine the spec: any active staff/admin can edit any Action (track `updatedById`); assignee rejection
   is 422; dashboards use Asia/Bangkok; add My Open Actions + urgent list + Waiting for Me; give every metric
   a query/empty/drill-down."**
   Added BR-20–BR-22, AC-22–AC-26, and the §8.1 metric catalog (`e434819` follow-up).

3. _"Write `api-spec.md` / `ui-spec.md` / `tests.md` matching Lab 3 conventions; every AC maps to ≥1 test with
   the handout §12 file paths."_
   Produced the contract docs and the 52-test plan with full AC traceability.

4. _"<Actions Taken foundation prompt — Prisma migration + model + seed + API + authz + tests>"_
   → _<commit>_, API-L4-01..14, MIG-L4-01..04.

5. _"<Ticket workflow / resolution gate prompt>"_ → _<commit>_, API-L4-15..20.

6. _"<Role dashboards prompt — backend metrics + UI>"_ → _<commit>_, API-L4-21..29, UI-L4-01..04.

7. _"<Actions Taken UI prompt>"_ → _<commit>_, UI-L4-05..07.

8. _"<Final hardening / regression prompt>"_ → _<commit>_, REG-L4-01, E2E-L4-01..04.

<!-- Keep 6–10 total. Replace placeholders with real prompts, commits, and outcomes. -->

## 3. Where the agent was wrong (and how it was caught)

- _<example: the agent first proposed 409 for an inactive assignee; the contract requires 422 — caught in
  review and corrected in the spec before coding.>_
- _<add real cases: a mis-ordered error check caught by API-L4-17, a timezone off-by-one caught by
  UNIT-L4-04, etc.>_

## 4. My Reflection

_<2–4 short paragraphs: how the specification agent changed the quality of the contract vs. jumping straight
to code; where the coding agent saved time; where human judgment / running the tests was essential; what you
would do differently next sprint.>_
