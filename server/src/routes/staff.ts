// IT Staff endpoints (Lab 3)
// Issue #26 — Ticket Queue:
//   GET /api/staff/tickets    — queue (roles IT_STAFF, ADMIN read-only) BR-22, BR-56, BR-57
//   GET /api/staff/assignees  — active IT Staff for the reassign/owner dropdown (IT_STAFF only)
// Role is enforced per-route because the two routes differ (BR-22 authorization matrix).
// Ticket operations and detail (claim, owner, status, comments, notes) are Issue #27.

import { Router, type Request, type Response, type RequestHandler } from "express";
import path from "path";
import { promises as fs } from "fs";
import { prisma } from "../prismaClient";
import { requireRole } from "../middleware/auth";
import { parseStaffQueueQuery } from "../lib/staffQueue";
import { allowedTransitions, canTransition } from "../lib/ticketStatus";
import type { Prisma, TicketStatus, Priority } from "@prisma/client";

const router = Router();

// Active = everything except CLOSED and CANCELLED (BR-57).
const ACTIVE_EXCLUDED: TicketStatus[] = ["CLOSED", "CANCELLED"];

// ── GET /api/staff/tickets ───────────────────────────────────────────────────

router.get(
  "/tickets",
  requireRole("IT_STAFF", "ADMIN") as RequestHandler,
  async (req: Request, res: Response) => {
    const p = parseStaffQueueQuery(req.query as Record<string, unknown>);
    const me = req.user!.id;

    // status filter → where fragment
    let statusWhere: Prisma.TicketWhereInput = {};
    if (p.status === "ACTIVE") {
      statusWhere = { currentStatus: { notIn: ACTIVE_EXCLUDED } };
    } else if (p.status === "ALL") {
      statusWhere = {};
    } else {
      statusWhere = { currentStatus: p.status };
    }

    // owner filter → where fragment.
    // For an Administrator owner=ME resolves to their own id, which no Ticket
    // can hold (owners are IT_STAFF), so it returns no rows (api-spec §5).
    let ownerWhere: Prisma.TicketWhereInput = {};
    switch (p.owner.kind) {
      case "ANY":
        break;
      case "UNASSIGNED":
        ownerWhere = { ownerId: null };
        break;
      case "ME":
        ownerWhere = { ownerId: me };
        break;
      case "USER":
        ownerWhere = { ownerId: p.owner.id };
        break;
    }

    const where: Prisma.TicketWhereInput = {
      AND: [
        statusWhere,
        ownerWhere,
        p.priority ? { itPriority: p.priority } : {},
        p.categoryId !== undefined ? { categoryId: p.categoryId } : {},
        // requesterResolved=true: restrict to Tickets the Requester flagged
        // (BR-57). "Active only" follows from the status filter (default
        // ACTIVE), which this ANDs with like every other filter.
        p.requesterResolved ? { requesterResolvedAt: { not: null } } : {},
        p.search
          ? {
              OR: [
                { ticketNumber: { contains: p.search, mode: "insensitive" } },
                { summary: { contains: p.search, mode: "insensitive" } },
                { requester: { name: { contains: p.search, mode: "insensitive" } } },
              ],
            }
          : {},
      ],
    };

    // orderBy: primary sort, then createdAt asc (BR-56 default tiebreaker),
    // then id asc for a stable, deterministic order.
    const orderBy: Prisma.TicketOrderByWithRelationInput[] = [
      { [p.sortBy]: p.sortDir } as Prisma.TicketOrderByWithRelationInput,
    ];
    if (p.sortBy !== "createdAt") orderBy.push({ createdAt: "asc" });
    orderBy.push({ id: "asc" });

    // counts cover active Tickets only and ignore the current filters (BR-57).
    const activeWhere: Prisma.TicketWhereInput = {
      currentStatus: { notIn: ACTIVE_EXCLUDED },
    };

    const [tickets, totalCount, unassigned, assignedToMe, requesterResolved] =
      await Promise.all([
        prisma.ticket.findMany({
          where,
          include: {
            category: { select: { name: true } },
            requester: { select: { id: true, name: true } },
            owner: { select: { id: true, name: true, isActive: true, role: true } },
          },
          orderBy,
          skip: (p.page - 1) * p.pageSize,
          take: p.pageSize,
        }),
        prisma.ticket.count({ where }),
        prisma.ticket.count({ where: { AND: [activeWhere, { ownerId: null }] } }),
        prisma.ticket.count({ where: { AND: [activeWhere, { ownerId: me }] } }),
        prisma.ticket.count({
          where: { AND: [activeWhere, { requesterResolvedAt: { not: null } }] },
        }),
      ]);

    const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / p.pageSize);

    res.status(200).json({
      data: tickets.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        summary: t.summary,
        category: t.category.name,
        requester: { id: t.requester.id, name: t.requester.name },
        requestedPriority: t.requestedPriority,
        itPriority: t.itPriority,
        currentStatus: t.currentStatus,
        owner: t.owner
          ? {
              id: t.owner.id,
              name: t.owner.name,
              // BR-29 / AC-78: an owner later deactivated or role-changed is
              // kept but marked no longer active IT Staff.
              isActiveStaff: t.owner.isActive && t.owner.role === "IT_STAFF",
            }
          : null,
        requesterResolvedAt: t.requesterResolvedAt,
      })),
      pagination: {
        page: p.page,
        pageSize: p.pageSize,
        totalCount,
        totalPages,
      },
      counts: { unassigned, assignedToMe, requesterResolved },
    });
  }
);

// ── GET /api/staff/assignees ─────────────────────────────────────────────────
// Active IT Staff only, for the owner/reassign dropdown. IT_STAFF only (ADMIN
// → 403 per the authorization matrix). Returns only id and name — no password,
// email or role.

router.get(
  "/assignees",
  requireRole("IT_STAFF") as RequestHandler,
  async (_req: Request, res: Response) => {
    const staff = await prisma.user.findMany({
      where: { role: "IT_STAFF", isActive: true },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    res.status(200).json(staff.map((s) => ({ id: s.id, name: s.name })));
  }
);

// ── Ticket operations and detail (Issue #27) ─────────────────────────────────
// GET    /tickets/:id                                        detail (IT_STAFF, ADMIN read-only)
// POST   /tickets/:id/claim                                  claim (IT_STAFF)
// PATCH  /tickets/:id/owner                                  assign / reassign (IT_STAFF)
// PATCH  /tickets/:id/it-priority                            IT Priority (IT_STAFF)
// PATCH  /tickets/:id/status                                 status workflow (IT_STAFF)
// GET    /tickets/:id/attachments/:attachmentId/download     download (IT_STAFF)
//
// There is deliberately no staff upload or remove route (spec §11): IT Staff may
// only view metadata and download active files.

// Attachments live in the Lab 2 upload directory (same path the Requester routes use).
const UPLOAD_DIR = path.join(process.cwd(), "uploads", "lab-02");

// Frozen = owner / IT Priority changes are refused with TICKET_CLOSED (BR-30).
const FROZEN: TicketStatus[] = ["CLOSED", "CANCELLED"];
const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH"];
const ALL_STATUSES: TicketStatus[] = [
  "NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER",
  "RESOLVED", "CLOSED", "REOPENED", "CANCELLED",
];

function parseId(raw: unknown): number | null {
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Owner view for responses. isActiveStaff is false for an owner later deactivated
// or role-changed (BR-29 / AC-78); the owner is kept, just marked.
function ownerView(
  owner: { id: number; name: string; isActive: boolean; role: string } | null
): { id: number; name: string; isActiveStaff: boolean } | null {
  if (!owner) return null;
  return {
    id: owner.id,
    name: owner.name,
    isActiveStaff: owner.isActive && owner.role === "IT_STAFF",
  };
}

const notFound = (res: Response) =>
  res.status(404).json({ error: "Ticket not found", code: "NOT_FOUND" });

const OWNER_SELECT = {
  select: { id: true, name: true, isActive: true, role: true },
} as const;

// ── GET /api/staff/tickets/:id ───────────────────────────────────────────────

router.get(
  "/tickets/:id",
  requireRole("IT_STAFF", "ADMIN") as RequestHandler,
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === null) return void notFound(res);

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        category: { select: { name: true } },
        relatedSystem: { select: { name: true } },
        requester: { select: { id: true, name: true, email: true } },
        owner: OWNER_SELECT,
        attachments: { orderBy: { uploadedAt: "asc" } },
        _count: { select: { publicComments: true, internalNotes: true } },
      },
    });
    if (!ticket) return void notFound(res);

    // An Administrator is read-only: allowedTransitions is always empty (BR-22).
    const transitions =
      req.user!.role === "ADMIN" ? [] : allowedTransitions(ticket.currentStatus);

    res.status(200).json({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      summary: ticket.summary,
      description: ticket.description,
      category: ticket.category.name,
      relatedSystem: ticket.relatedSystem.name,
      requester: {
        id: ticket.requester.id,
        name: ticket.requester.name,
        email: ticket.requester.email,
      },
      owner: ownerView(ticket.owner),
      requestedPriority: ticket.requestedPriority,
      itPriority: ticket.itPriority,
      currentStatus: ticket.currentStatus,
      resolutionSummary: ticket.resolutionSummary,
      resolvedAt: ticket.resolvedAt,
      closedAt: ticket.closedAt,
      requesterResolvedAt: ticket.requesterResolvedAt,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      attachments: ticket.attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        sizeBytes: a.sizeBytes,
        uploadedAt: a.uploadedAt,
        removedAt: a.removedAt,
        removalReason: a.removalReason,
      })),
      allowedTransitions: transitions,
      counts: {
        publicComments: ticket._count.publicComments,
        internalNotes: ticket._count.internalNotes,
      },
    });
  }
);

// ── POST /api/staff/tickets/:id/claim ────────────────────────────────────────
// Atomic (BR-67): a conditional update WHERE ownerId IS NULL means two
// simultaneous claims produce exactly one success. A NEW Ticket also becomes
// OPEN in the same update (BR-27). Conflict order: TICKET_CLOSED → ALREADY_OWNED.

router.post(
  "/tickets/:id/claim",
  requireRole("IT_STAFF") as RequestHandler,
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === null) return void notFound(res);
    const me = req.user!.id;

    // Single atomic conditional claim (BR-67): one autocommit statement updates
    // the row only while it is still unassigned AND not closed/cancelled, so the
    // frozen and ownership guards are evaluated against the same row version — a
    // ticket cancelled concurrently cannot be claimed. Two simultaneous claims
    // yield exactly one success; the other affects zero rows. A NEW ticket also
    // becomes OPEN in the same statement (BR-27). No interactive transaction is
    // held open across awaits, so concurrent claims cannot stall on a connection.
    const affected = await prisma.$executeRaw`
      UPDATE "Ticket"
      SET "ownerId" = ${me},
          "currentStatus" = CASE WHEN "currentStatus" = 'NEW' THEN 'OPEN'::"TicketStatus" ELSE "currentStatus" END,
          "updatedAt" = NOW()
      WHERE "id" = ${id}
        AND "ownerId" IS NULL
        AND "currentStatus" NOT IN ('CLOSED', 'CANCELLED')`;

    if (affected === 0) {
      // Decide why nothing changed with a single read, preserving the claim
      // conflict order: NOT_FOUND → TICKET_CLOSED → ALREADY_OWNED.
      const t = await prisma.ticket.findUnique({ where: { id } });
      if (!t) return void notFound(res);
      if (FROZEN.includes(t.currentStatus)) {
        return void res.status(409).json({
          error: "This ticket is closed or cancelled.",
          code: "TICKET_CLOSED",
        });
      }
      return void res.status(409).json({
        error: "This ticket already has an owner.",
        code: "ALREADY_OWNED",
      });
    }

    const updated = await prisma.ticket.findUnique({
      where: { id },
      include: { owner: OWNER_SELECT },
    });
    res.status(200).json({
      owner: ownerView(updated!.owner),
      currentStatus: updated!.currentStatus,
    });
  }
);

// ── PATCH /api/staff/tickets/:id/owner ───────────────────────────────────────
// Assign or reassign; allowed on an unassigned Ticket; never changes status
// (BR-28). Order: 404 → validation 400 (invalid/inactive/non-staff target) →
// 409 TICKET_CLOSED → 409 NO_CHANGE (per BR-24: a valid same value on a frozen
// Ticket is TICKET_CLOSED; an invalid value is 400 even on a frozen Ticket).

router.patch(
  "/tickets/:id/owner",
  requireRole("IT_STAFF") as RequestHandler,
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === null) return void notFound(res);

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return void notFound(res);

    const ownerIdRaw = (req.body as Record<string, unknown>).ownerId;
    const ownerId =
      typeof ownerIdRaw === "number" && Number.isInteger(ownerIdRaw) && ownerIdRaw > 0
        ? ownerIdRaw
        : null;
    const target =
      ownerId !== null ? await prisma.user.findUnique({ where: { id: ownerId } }) : null;
    if (!target || !target.isActive || target.role !== "IT_STAFF") {
      return void res.status(400).json({
        error: "Owner must be an active IT Staff user.",
        errors: { ownerId: "Select an active IT Staff user." },
      });
    }

    if (FROZEN.includes(ticket.currentStatus)) {
      return void res.status(409).json({
        error: "This ticket is closed or cancelled.",
        code: "TICKET_CLOSED",
      });
    }
    if (ticket.ownerId === ownerId) {
      return void res.status(409).json({
        error: "That user already owns this ticket.",
        code: "NO_CHANGE",
      });
    }

    const updated = await prisma.ticket.update({
      where: { id },
      data: { ownerId },
      include: { owner: OWNER_SELECT },
    });
    res.status(200).json({ owner: ownerView(updated.owner) });
  }
);

// ── PATCH /api/staff/tickets/:id/it-priority ─────────────────────────────────
// Changeable while unassigned (BR-38). Order: 404 → 400 invalid value →
// 409 TICKET_CLOSED → 409 NO_CHANGE.

router.patch(
  "/tickets/:id/it-priority",
  requireRole("IT_STAFF") as RequestHandler,
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === null) return void notFound(res);

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return void notFound(res);

    const value = String((req.body as Record<string, unknown>).itPriority ?? "").trim();
    if (!PRIORITIES.includes(value as Priority)) {
      return void res.status(400).json({
        error: "Invalid IT Priority.",
        errors: { itPriority: "IT Priority must be LOW, MEDIUM or HIGH." },
      });
    }
    const itPriority = value as Priority;

    if (FROZEN.includes(ticket.currentStatus)) {
      return void res.status(409).json({
        error: "This ticket is closed or cancelled.",
        code: "TICKET_CLOSED",
      });
    }
    if (ticket.itPriority === itPriority) {
      return void res.status(409).json({
        error: "The ticket already has this IT Priority.",
        code: "NO_CHANGE",
      });
    }

    const updated = await prisma.ticket.update({ where: { id }, data: { itPriority } });
    res.status(200).json({ itPriority: updated.itPriority });
  }
);

// ── PATCH /api/staff/tickets/:id/status ──────────────────────────────────────
// Order (BR-24 as clarified): 404 → 400 enum membership → 409 NO_CHANGE →
// 409 INVALID_TRANSITION (with `allowed`) → 409 TICKET_UNASSIGNED → then the
// target-conditional 400 checks (resolutionSummary for RESOLVED, confirm for
// CLOSED/CANCELLED) run only once the transition itself is legal.

router.patch(
  "/tickets/:id/status",
  requireRole("IT_STAFF") as RequestHandler,
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === null) return void notFound(res);

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return void notFound(res);

    const body = req.body as Record<string, unknown>;
    const statusRaw = String(body.status ?? "").trim();
    if (!ALL_STATUSES.includes(statusRaw as TicketStatus)) {
      return void res.status(400).json({
        error: "Invalid status.",
        errors: { status: "Unknown status value." },
      });
    }
    const target = statusRaw as TicketStatus;
    const current = ticket.currentStatus;

    if (target === current) {
      return void res.status(409).json({
        error: "The ticket already has this status.",
        code: "NO_CHANGE",
      });
    }
    if (!canTransition(current, target)) {
      return void res.status(409).json({
        error: `Cannot change status from ${current} to ${target}.`,
        code: "INVALID_TRANSITION",
        allowed: allowedTransitions(current),
      });
    }
    if (ticket.ownerId === null) {
      return void res.status(409).json({
        error: "Claim the ticket before changing its status.",
        code: "TICKET_UNASSIGNED",
      });
    }

    const data: Prisma.TicketUpdateInput = { currentStatus: target };
    if (target === "RESOLVED") {
      const summary = String(body.resolutionSummary ?? "").trim();
      if (summary.length < 10 || summary.length > 1000) {
        return void res.status(400).json({
          error: "A resolution summary of 10–1000 characters is required.",
          errors: { resolutionSummary: "Enter a resolution summary of 10–1000 characters." },
        });
      }
      data.resolutionSummary = summary;
      data.resolvedAt = new Date();
      data.requesterResolvedAt = null; // cleared on RESOLVED (BR-35, BR-41)
    } else if (target === "CLOSED" || target === "CANCELLED") {
      if (body.confirm !== true) {
        return void res.status(400).json({
          error: "Please confirm this action.",
          errors: { confirm: "Confirmation is required." },
        });
      }
      if (target === "CLOSED") {
        data.closedAt = new Date(); // only CLOSED sets closedAt (BR-36)
      }
      // CANCELLED leaves closedAt null (BR-36)
    } else if (target === "REOPENED") {
      // REOPENED clears resolution/close dates and the indicator (BR-37, BR-41);
      // the previous resolutionSummary is kept until replaced.
      data.resolvedAt = null;
      data.closedAt = null;
      data.requesterResolvedAt = null;
    }

    const updated = await prisma.ticket.update({ where: { id }, data });
    res.status(200).json({
      currentStatus: updated.currentStatus,
      resolvedAt: updated.resolvedAt,
      closedAt: updated.closedAt,
      requesterResolvedAt: updated.requesterResolvedAt,
      resolutionSummary: updated.resolutionSummary,
      allowedTransitions: allowedTransitions(updated.currentStatus),
    });
  }
);

// ── GET /api/staff/tickets/:id/attachments/:attachmentId/download ─────────────
// IT Staff may download any ticket's active attachment; no ownership filter
// (BR-47). Removed files return 410.

router.get(
  "/tickets/:id/attachments/:attachmentId/download",
  requireRole("IT_STAFF") as RequestHandler,
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const attachmentId = parseId(req.params.attachmentId);
    if (id === null || attachmentId === null) {
      return void res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
    }

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return void notFound(res);

    const attachment = await prisma.attachment.findFirst({
      where: { id: attachmentId, ticketId: id },
    });
    if (!attachment) {
      return void res.status(404).json({ error: "Attachment not found", code: "NOT_FOUND" });
    }
    if (attachment.removedAt !== null) {
      return void res.status(410).json({ error: "Attachment has been removed" });
    }

    const filePath = path.join(UPLOAD_DIR, attachment.storedFileName);
    try {
      await fs.access(filePath);
    } catch {
      return void res.status(404).json({ error: "File not found on disk", code: "NOT_FOUND" });
    }

    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${attachment.fileName}"`
    );
    res.sendFile(filePath, { root: "/" });
  }
);

export default router;
