-- Lab 4 migration: Actions Taken (spec §7.1 / §7.3).
-- ADDITIVE ONLY. No ALTER/DROP/RENAME on any Lab 1-3 table; no existing column
-- is touched. The new `actions` / `performedActions` / `updatedActions` /
-- `assignedActions` relations are Prisma-virtual — the FK columns live only on
-- the new "ActionTaken" table. All existing Users, Tickets, Attachments,
-- PublicComments, InternalNotes, Sessions, Categories, RelatedSystems and the
-- TicketCounter remain valid and untouched.
--
-- Rollback (spec §7.3): the only statements needed to undo this migration are
--   DROP TABLE "ActionTaken";
--   DROP TYPE "ActionStatus";
-- which drop exactly the Action rows, their three indexes, their four foreign
-- keys, and the now-unreferenced enum — and nothing else.

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ActionTaken" (
    "id"               SERIAL         NOT NULL,
    "ticketId"         INTEGER        NOT NULL,
    "actionDate"       TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description"      TEXT           NOT NULL,
    "result"           TEXT,
    "performedById"    INTEGER        NOT NULL,
    "updatedById"      INTEGER,
    "assigneeId"       INTEGER,
    "followUpRequired" BOOLEAN        NOT NULL DEFAULT false,
    "followUpNote"     TEXT,
    "attachmentNotes"  TEXT,
    "status"           "ActionStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt"        TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3)   NOT NULL,
    CONSTRAINT "ActionTaken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionTaken_ticketId_createdAt_idx" ON "ActionTaken"("ticketId", "createdAt");
CREATE INDEX "ActionTaken_ticketId_status_idx"    ON "ActionTaken"("ticketId", "status");
CREATE INDEX "ActionTaken_assigneeId_status_idx"  ON "ActionTaken"("assigneeId", "status");

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_performedById_fkey"
  FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_assigneeId_fkey"
  FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
