# Lab 1 — AI Use and Reflection

> Replace the details below with your own actual AI/IDE agent, model, and prompts
> before submitting. This is a starting template based on how this project was
> structured — edit it to reflect what you personally asked and learned.

I used _(your IDE / agent, e.g. Antigravity, Claude Code, etc.)_ with
_(model name)_ at thinking level _(if applicable)_.

## Selected key prompts

| Prompt Name | Actual Prompt Text | My Reflection |
|---|---|---|
| Plan Lab 1 implementation | "Read the TokTickIT Lab 1 requirements. Summarize the four GitHub Issues, their dependencies, required outputs, and required automated tests. Propose an implementation order, but do not write code yet." | _(e.g. worked in one shot / needed follow-up)_ |
| Set up full-stack project | "Set up the TokTickIT project using React, TypeScript, Vite, and Bootstrap for the frontend, and Node.js, Express, and TypeScript for the backend. Configure PostgreSQL and Prisma using the required repository structure. Do not add functionality beyond Lab 1 scope." | |
| Implement health check | "Add GET /api/health to the Express backend. It must return HTTP 200 with `{status: \"ok\", service: \"TokTickIT API\"}`. Write a Supertest test for it." | |
| Create and seed Category model | "Create a Prisma Category model with id, unique name, and createdAt. Write a migration and an idempotent seed script (use upsert) that inserts the four required categories." | |
| Implement category list feature | "Add GET /api/categories returning categories from PostgreSQL via Prisma, ordered by id. Add a Supertest test. Update the React app to fetch and display the categories with loading and error states, and a Vitest test for it." | |
| Build Check System UI | "Create a Bootstrap-based page with a Check System button. On click, show a loading state, call /api/health then /api/categories, and display Online status + category list on success, or an offline error message on failure." | |
| Review final Lab 1 work | "Review the completed TokTickIT Lab 1 implementation against every acceptance criterion in the labsheet. List anything missing or incorrect." | |

## Reflection

_(2–4 sentences: what worked well, what needed correcting, what you learned about
reviewing AI-generated code/tests/commands rather than trusting them outright.)_
