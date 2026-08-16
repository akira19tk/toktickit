# Lab 1 — AI Use and Reflection

I used **Claude** (Anthropic) as my AI coding assistant for this lab. I used it to get
help with specific parts of the setup and to debug errors I ran into — not to generate
and submit the whole project without review. I read and tested every change myself
before committing it.

## Selected key prompts

| Prompt Name | Actual Prompt Text | My Reflection |
|---|---|---|
| Understand the assignment | "What is the purpose of this lab? Please explain it in simple terms and guide me through how to complete each step." | Asked for a breakdown of the labsheet into steps I could follow myself, not for the answer. Helped me plan before touching any code. |
| Get help starting the project structure | "Could you recommend or help me set up an initial project structure? " | Used this as a starting scaffold (client/server folders, package configs), then went through each file myself to understand what it does before running anything. |
| Ask for help fixing an npm permission error | Pasted the `npm install` EACCES error and asked what it meant | Learned it was a root-owned npm cache issue from a past `sudo` use. I ran the suggested `chown` fix myself and verified `npm install` worked after. |
| Ask for help with a PostgreSQL connection error | Pasted the `role "thanyagorn" does not exist` error and asked why | Learned that a Postgres role is separate from a Mac username. I was given two options and chose myself to use the existing verified role rather than creating a new superuser role, to keep things simpler and safer. |
| Ask why Prisma was failing | Pasted the `datasource property url is no longer supported` error | Learned that npm had installed Prisma 7 by default, which changed its config format. I chose to downgrade to Prisma 6 myself to match the standard workflow the lab expects, rather than adopting the newer config approach. |
| Ask why the dev server / seed script crashed | Pasted the `ts-node` `Cannot read properties of undefined` crash | Learned this was a TypeScript version incompatibility with `ts-node`. Switched to `tsx` as a more version-tolerant alternative, and re-ran the seed and tests myself to confirm the fix actually worked (not just took the AI's word for it). |
| Ask for help understanding a git error | Pasted the `fatal: bad object refs/heads/main 2` warning | Asked what caused it before acting. Learned it was a stray broken local ref and removed it manually, then re-checked `git branch -a` myself to confirm the repo was clean. |
| Ask why `gh pr create` failed | Pasted the "No commits between branches" error | Learned that a feature branch needs an actual diff from its base before GitHub allows a PR. I decided what content to add to each branch (a short verification note per Issue) rather than having the AI generate arbitrary filler commits. |
| Ask for git/GitHub workflow guidance in Thai | "ช่วยอธิบายเป็นภาษาไทยหน่อย" | Asked for explanations of what each git command does, not just the commands themselves, so I could run them understanding the effect rather than copy-pasting blindly. |

## Reflection

I used Claude mainly to explain errors I didn't recognize (npm permissions, Postgres
roles, Prisma/ts-node version conflicts) and to get an initial project structure I could
inspect and build on, rather than to write the whole submission for me. For every fix
suggested, I ran it myself and re-checked the result — for example, re-running `npm test`
and querying the database directly with `psql` after the Prisma/seed fixes, instead of
trusting the AI's explanation alone. The main lesson was that even when AI assistance
speeds up scaffolding and debugging, I still had to understand *why* each error happened
and *decide* which fix approach to take myself, since I'm the one responsible for the
final code.
