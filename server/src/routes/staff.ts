// IT Staff endpoints (Lab 3)
// Issue #26 — Ticket Queue:
//   GET /api/staff/tickets    — queue (roles IT_STAFF, ADMIN read-only) BR-22, BR-56, BR-57
//   GET /api/staff/assignees  — active IT Staff for the reassign/owner dropdown (IT_STAFF only)
// Role is enforced per-route because the two routes differ (BR-22 authorization matrix).
// Ticket operations and detail (claim, owner, status, comments, notes) are Issue #27.

import { Router, type Request, type Response, type RequestHandler } from "express";
import { prisma } from "../prismaClient";
import { requireRole } from "../middleware/auth";
import { parseStaffQueueQuery } from "../lib/staffQueue";
import type { Prisma, TicketStatus } from "@prisma/client";

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

export default router;
