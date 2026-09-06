# Lab 2 AI Use and Reflection — TokTickIT Requester Ticketing MVP

I used the Claude Code coding agent with **Claude Sonnet 4.5** as the underlying LLM
throughout Lab 2, for both implementation and debugging. I also used Claude (chat) as an
AI specification agent to draft `specification.md`, `tests.md`, `ui-spec.md`, and
`api-spec.md` before any implementation began, per the Spec-Driven Development workflow
required by the handout.

## Selected Key Prompts

| Prompt Name | Actual Prompt Text | My Reflection |
|---|---|---|
| **Implement Requester Context** | "อ่าน docs/lab-02/specification.md, tests.md, ui-spec.md, api-spec.md เป็น contract. Implement Issue #2 เท่านั้น: DevRequester model + migration, idempotent seed (4 active + 1 inactive requester, 6+ related systems), GET /api/dev-requesters, GET /api/related-systems, Development Requester Selection screen ตาม ui-spec.md section 10.2, requester context + Change Requester action. ก่อนเขียนโค้ด บอกฉันก่อนว่ามี ambiguity หรือจุดที่ contract ไม่ชัดตรงไหนบ้าง อย่าเดาเอง. เขียนเทส API-19, UI-06, UI-07 ให้ fail ก่อน implement ตาม tests.md แล้วรันจริงให้ผ่านทั้งหมด แสดง output" | The agent surfaced 7 real ambiguities before writing any code (e.g. sessionStorage vs localStorage for the requester context, whether to add `isActive` to Category now or later, ownership-failure status code). This forced me to make and document explicit decisions rather than let the agent guess silently — exactly what the handout asks for. Once I answered all 7, implementation and the red→green test cycle worked cleanly in one pass. |
| **Implement Create Ticket** | "Implement Issue #3 เท่านั้น: POST /api/tickets ตาม api-spec.md section 4 (รวม attachment upload ในคำขอเดียว), Create Ticket UI ตาม ui-spec.md section 10.3. เขียนเทส UNIT-01, API-01 ถึง API-05, UI-02 ถึง UI-05, UI-13 ให้ fail ก่อน แล้ว implement จนผ่านจริง ห้าม skip เทส แสดง output การรันเทสจริง" | This prompt again produced 9 ambiguities before coding (ticket-number generation strategy, file storage location, missing-header status code, etc.). The agent's own suggestion to use a separate `TicketCounter` sequence instead of tying the ticket number to `ticket.id` was a genuinely better design than what I would have specified myself, and I approved it after understanding the trade-off it explained. |
| **Implement My Tickets** | "Implement Issue #4 เท่านั้น: GET /api/tickets ตาม api-spec.md section 5 (search/filter/sort/pagination), My Tickets UI ตาม ui-spec.md section 10.4. เขียนเทส API-06 ถึง API-12, UI-08 ถึง UI-10 ให้ fail ก่อน แล้ว implement จนผ่านจริง ห้าม skip เทส แสดง output" | Ambiguities here were mostly about query-parameter design (category by id vs name, case sensitivity on status, pagination window size). Deciding these upfront meant the API contract stayed internally consistent instead of the frontend and backend silently disagreeing on shape, which is a failure mode I've hit before when skipping this step. |
| **Implement Ticket Detail and Attachments** | "Implement Issue #5: GET /api/tickets/:id attachments, POST add attachment, GET download, DELETE soft-remove ตาม api-spec.md sections 6-9. Ticket Detail UI ตาม ui-spec.md section 10.5. ห้ามทำ: comments, internal notes, status change. เขียนเทส API-13-18, UI-11-12 ให้ fail ก่อน implement จนผ่านจริง แสดง output" | All 46 tests (server + client) passed on the first reported run. However, my own manual browser testing afterward caught two real bugs the automated tests missed entirely: Category/Related System displaying raw ids instead of names, and the Download button failing because browser-native navigation can't send the `x-requester-id` header. This was the clearest evidence in the whole sprint that passing tests is not the same as a working product — the agent's "all tests pass" claim was true but incomplete. |
| **Fix bugs found during manual UI testing** | "ในหน้า Ticket Detail (TicketDetail.tsx) ตอนนี้ field Category และ Related System แสดงเป็นตัวเลข id ดิบ... แก้โดยให้ frontend ดาวน์โหลดผ่าน fetch() พร้อมแนบ x-requester-id header... รันเทสเดิมทั้งหมดอีกครั้ง ยืนยันว่าไม่พัง แสดง output" | Requiring the agent to re-run the full existing test suite after every fix (not just the new one) meant I could confirm the fixes didn't silently break anything else, which they didn't. This is the pattern I'll keep using going forward: never accept a fix without seeing the full regression run afterward. |

## Reflection

The single most useful habit this sprint was **forcing the agent to list ambiguities before
writing any code**, rather than letting it infer reasonable-sounding defaults silently. Across
the four implementation prompts, the agent surfaced roughly 30 concrete decision points that
the handout deliberately left open for the student to resolve (status codes, storage
strategy, persistence mechanism, query-parameter semantics). Answering these explicitly meant
I could actually explain every design choice afterward, which is the accountability the
handout asks for — I was not just approving code I didn't understand.

The clearest limitation I found was that **passing automated tests did not guarantee a
working UI**. The Category/Related System display bug and the Download bug both happened in
code paths the written tests didn't exercise (the tests checked the API response shape and
the component rendering with mocked data, not an end-to-end browser download flow with real
headers). My own manual click-through testing — the same testing I did to produce the
screenshots for this submission — caught both, which reinforced why the Definition of Done
explicitly says "the AI agent's claim is not evidence."
