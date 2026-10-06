-- Lab 3 migration: Users, Auth, Ticket extensions
-- Hand-edited from the Prisma-generated output to:
--   (a) RENAME DevRequester → User instead of DROP/CREATE (preserves ids and foreign keys;
--       PostgreSQL automatically updates FKs on other tables that reference the renamed table)
--   (b) add itPriority nullable first, backfill from requestedPriority, then set NOT NULL
--   (c) extend TicketStatus with ADD VALUE; the new values are not used in this migration

-- 1. Create the Role enum before adding the role column to User
CREATE TYPE "Role" AS ENUM ('REQUESTER', 'IT_STAFF', 'ADMIN');

-- 2. Rename the table and its Prisma-managed names to match the new model name.
--    PostgreSQL automatically redirects FKs on Ticket (Ticket_requesterId_fkey) to the
--    renamed table, so no drop/re-add of that constraint is needed.
--    The sequence is NOT auto-renamed with the table; we rename it explicitly so the
--    Prisma drift check finds the name it expects (User_id_seq).
ALTER TABLE "DevRequester" RENAME TO "User";
ALTER TABLE "User" RENAME CONSTRAINT "DevRequester_pkey" TO "User_pkey";
ALTER INDEX "DevRequester_email_key" RENAME TO "User_email_key";
ALTER SEQUENCE "DevRequester_id_seq" RENAME TO "User_id_seq";

-- 3. Normalise existing emails to lowercase (BR-06 requires case-insensitive uniqueness)
UPDATE "User" SET email = LOWER(email);

-- 4. Add new User columns; role and mustChangePassword have DB defaults so existing
--    rows are valid immediately without a separate backfill step
ALTER TABLE "User"
  ADD COLUMN "passwordHash"       TEXT,
  ADD COLUMN "role"               "Role"    NOT NULL DEFAULT 'REQUESTER',
  ADD COLUMN "mustChangePassword" BOOLEAN   NOT NULL DEFAULT true,
  ADD COLUMN "passwordChangedAt"  TIMESTAMP(3),
  ADD COLUMN "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 5. Composite index used by role-based permission lookups and queue counts
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

-- 6. Add itPriority as nullable so the UPDATE below can fill existing rows before
--    the NOT NULL constraint is enforced
ALTER TABLE "Ticket" ADD COLUMN "itPriority" "Priority";

-- 7. Backfill: BR-60 requires itPriority = requestedPriority for every migrated ticket
UPDATE "Ticket" SET "itPriority" = "requestedPriority";

-- 8. Safe to enforce NOT NULL now because every row has a value after step 7
ALTER TABLE "Ticket" ALTER COLUMN "itPriority" SET NOT NULL;

-- 9. Remaining new Ticket columns (all nullable — no backfill needed)
ALTER TABLE "Ticket"
  ADD COLUMN "ownerId"             INTEGER,
  ADD COLUMN "requesterResolvedAt" TIMESTAMP(3),
  ADD COLUMN "resolutionSummary"   TEXT,
  ADD COLUMN "resolvedAt"          TIMESTAMP(3),
  ADD COLUMN "closedAt"            TIMESTAMP(3);

-- 10. FK for Ticket.ownerId; RESTRICT because users are never deleted (BR-53)
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 11. New Ticket indexes used by the queue filters and staff detail queries
CREATE INDEX "Ticket_ownerId_idx"       ON "Ticket"("ownerId");
CREATE INDEX "Ticket_currentStatus_idx" ON "Ticket"("currentStatus");
CREATE INDEX "Ticket_itPriority_idx"    ON "Ticket"("itPriority");

-- 12. Extend TicketStatus with the new workflow states.
--     The new values are not used anywhere in this migration.
ALTER TYPE "TicketStatus" ADD VALUE 'OPEN';
ALTER TYPE "TicketStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "TicketStatus" ADD VALUE 'WAITING_FOR_REQUESTER';
ALTER TYPE "TicketStatus" ADD VALUE 'RESOLVED';
ALTER TYPE "TicketStatus" ADD VALUE 'CLOSED';
ALTER TYPE "TicketStatus" ADD VALUE 'REOPENED';
ALTER TYPE "TicketStatus" ADD VALUE 'CANCELLED';

-- 13. Session table — only the SHA-256 hash of the cookie token is stored (BR-11)
CREATE TABLE "Session" (
    "tokenHash" TEXT         NOT NULL,
    "userId"    INTEGER      NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("tokenHash")
);
CREATE INDEX "Session_userId_idx"    ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
-- CASCADE: deleting a User removes all their sessions (BR-13)
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 14. PublicComment — separate table so a comment query cannot accidentally return a note
CREATE TABLE "PublicComment" (
    "id"        SERIAL       NOT NULL,
    "ticketId"  INTEGER      NOT NULL,
    "authorId"  INTEGER      NOT NULL,
    "body"      TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublicComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PublicComment_ticketId_createdAt_idx"
    ON "PublicComment"("ticketId", "createdAt");
ALTER TABLE "PublicComment" ADD CONSTRAINT "PublicComment_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublicComment" ADD CONSTRAINT "PublicComment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 15. InternalNote — identical shape, separate table (same structural isolation rationale)
CREATE TABLE "InternalNote" (
    "id"        SERIAL       NOT NULL,
    "ticketId"  INTEGER      NOT NULL,
    "authorId"  INTEGER      NOT NULL,
    "body"      TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InternalNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InternalNote_ticketId_createdAt_idx"
    ON "InternalNote"("ticketId", "createdAt");
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
