# Lab 4 — AI Use Report

## 1. Tools used and responsibilities

- **Claude (Opus), through claude.ai** — specification/planning support in the earlier work. The existing AI-use record identifies it as the specification agent used to draft the engineering contract and discuss requirements. This attribution is retained from that record; the original Claude conversation was not available in the continuation session. The student subsequently supplied the selected prompts in Section 2.
- **Claude Code (Opus)** — implementation support for the earlier Actions Taken, ticket workflow, dashboards and tests, as identified in the existing report and handoff. The precise Opus version was not recorded.
- **OpenAI Codex desktop coding agent** — continued the project from the handoff; inspected repository and GitHub state, implemented accessibility and regression hardening, updated tests and evidence, assisted with release preparation, and drafted documentation. The exact model identifier for this session was not recorded, so no model version is claimed.
- **The student** — selected the implementation scope, approved specification changes, ran Chromium E2E in local Terminal, checked actual results, merged approved PRs, and supplied the personal experiences used for My Reflection.
- **Peer reviewer @daisysia** — provided human review and approval on GitHub. Peer approval is distinct from AI assistance and automated test results.

The agent ran server, migration, client and build/lint checks. The student ran the successful local E2E checks because Chromium startup was blocked in the agent environment. Therefore, the earlier template's statement that the author ran every command has been corrected.

Stack: TypeScript, Express 5, Prisma 6/PostgreSQL, React 19/Vite, Vitest, Playwright and GitHub.

## 2. Selected prompts

The following six prompts were supplied by the student for this report. The reviewer-feedback text in prompt 6 is a concise summary supplied for the report, rather than a verbatim transcript of the original review.

### 1. Setup (Coding agent)

**Instructions:**
> Read the Lab 4 handout and explore this repo (docs, schema, server, client, tests). Summarize the architecture and what Lab 4 must add. Add Lab 4 rules to CLAUDE.md: one Issue = one feature branch = one PR into lab4-staging, tests first, preserve Lab 1-3 behavior, backend enforces all rules. Do not write feature code yet.

### 2. Draft spec (Spec agent)

**Instructions:**
> Act as my specification agent. Draft docs/lab-04/specification.md with FR, BR, AC (Given/When/Then), data changes, API summary, and Definition of Done. Do not copy the handout. BEFORE writing, list every ambiguity or contradiction in the handout and ask me to decide.

### 3. Refine spec (Spec agent)

**Instructions:**
> Before committing, check specification.md: any active IT Staff can update any Action; assignee must be active IT Staff (else 422); dashboard dates use Asia/Bangkok; add "My Open Actions" and "Waiting for Me" cards; every metric has an exact query, empty behavior, and drill-down URL. Add ACs and BRs for new items.

### 4. Decompose work (Spec agent)

**Instructions:**
> Decompose the sprint into 8-12 GitHub Issues with gh. Each issue: description, linked FR/AC/test IDs, acceptance checklist, branch name, and dependencies. Show me the list first, then add them to the Project board.

### 5. Implement with TDD (Coding agent)

**Instructions:**
> Work on Issue #51: Ticket workflow. Enforce the transition matrix server-side; block RESOLVED with 409 OPEN_ACTIONS_EXIST if any Action is OPEN, inside one serializable transaction; return 409 (never 500) on serialization failures. Show me the plan first, write failing tests, implement until they pass, run the full Labs 1-4 suite, then open a PR into lab4-staging.

### 6. Respond to peer review (Coding agent)

**Instructions:**
> PR #59 got this review: "1. Error handling order; 2. Requester access and data exposure; 3. Concurrency: stale updates and concurrent requests handled safely; 4. Test coverage for PATCH edge cases.". Respond with evidence, adding tests only where coverage is missing. Add a test firing two PATCHes with the same expectedUpdatedAt in parallel: exactly one 200 and one 409. Post a point-by-point reply with commit hashes and record the review in reviewer.md.


## 3. Limitations and corrections made during AI-assisted work

- **Historical context required verification.** The handoff described PR #64 as open, but a live GitHub check showed it was already merged. The agent checked repository/PR state before proceeding.
- **A test summary was not enough.** The initial parallel client run had a workflow timeout that passed in isolation. The agent recorded the failure, changed test execution/cleanup, and used real final results instead of treating the isolated pass as a full-suite pass.
- **The first server build exposed test-file compatibility problems.** The build reported CommonJS-incompatible `import.meta` and a missing explicit extension in a dynamic import. Both were corrected; the server build and affected server tests then passed. The original failed build output was retained.
- **Environment failure was not an application pass.** Chromium was denied startup permission in the agent environment. E2E stayed Blocked until the student supplied a successful local Terminal run. The agent did not weaken assertions or add retries to conceal it.
- **Public evidence needed a privacy check.** Publication of the initial raw transcript/screenshots was blocked by automatic review. Personal shell prompts were removed, the transcript was checked, and representative fixture screenshots were inspected for sensitive content before publication.
- **Automated coverage has limits.** Passing responsive/style tests and screenshot generation do not establish a full manual accessibility audit. Remaining Prisma CLI dependency advisories and post-release documentation work must not be described as resolved by a green test count.

Release [PR #66](https://github.com/akira19tk/toktickit/pull/66) merged as `a92fa7d`. The final-main checks were server **544**, migration **46**, client **127**, E2E **36**, with builds/lint passing. The main E2E run was performed by the student. This report does not claim that evidence from a feature branch alone verifies the release.

## 4. My Reflection

In this project, AI helped me most with writing tests and organizing submission evidence. It made reviewing test coverage and collecting results more systematic. Having a specification and acceptance criteria also helped me check whether the AI-generated tests covered the required behavior.

My main responsibility was running the tests and checking the results reported by AI. For example, the E2E tests could not run through the agent because the environment blocked Chromium from starting. I ran them in my local Terminal and confirmed that all 36 tests passed. I also ran them again after merging into main so that the evidence matched the submitted branch. This experience showed me that AI summaries need to be supported by actual test results.

Peer review also mattered. On PR #59, review follow-up added a parallel-PATCH test and changed the action update to an atomic guarded write, so two edits using the same timestamp cannot both succeed. The specification also needed reconciliation when BR-14 omitted NEW -> IN_PROGRESS. These examples showed me why I should check AI output against explicit rules and review evidence, rather than rely only on an earlier passing test summary.

For my next project, I will define the specification and acceptance criteria clearly before asking AI to write code. This will provide a shared basis for implementation and review. AI can save considerable time, but I remain responsible for verifying its work and deciding whether the results are acceptable.
