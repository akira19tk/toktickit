// Requester dashboard (Lab 4, Issue #52)
//   GET /api/requester/dashboard — REQUESTER only; scoped requesterId = me.
// All metrics are backend-computed from authoritative data (BR-18); empty scope
// returns 0 / [] (never 404). Date boundaries use Asia/Bangkok (BR-18, BR-22).
// IT_STAFF/ADMIN are 403 — they use /api/staff/dashboard (§8.2).

import { Router, type Request, type Response, type RequestHandler } from "express";
import { prisma } from "../prismaClient";
import { requireRole } from "../middleware/auth";
import { bangkokRecentCutoff } from "../lib/timezone";
import type { TicketStatus } from "@prisma/client";

const router = Router();

const OPEN_STATUSES: TicketStatus[] = ["NEW", "OPEN", "REOPENED"];

// ── GET /api/requester/dashboard ─────────────────────────────────────────────
router.get(
  "/dashboard",
  requireRole("REQUESTER") as RequestHandler,
  async (req: Request, res: Response) => {
    const requesterId = req.user!.id;
    const cutoff = bangkokRecentCutoff();

    const [open, inProgress, waitingForMe, resolved, closed, recentlyResolved, recent] =
      await Promise.all([
        prisma.ticket.count({ where: { requesterId, currentStatus: { in: OPEN_STATUSES } } }),
        prisma.ticket.count({ where: { requesterId, currentStatus: "IN_PROGRESS" } }),
        prisma.ticket.count({ where: { requesterId, currentStatus: "WAITING_FOR_REQUESTER" } }),
        prisma.ticket.count({ where: { requesterId, currentStatus: "RESOLVED" } }),
        prisma.ticket.count({ where: { requesterId, currentStatus: "CLOSED" } }),
        prisma.ticket.count({ where: { requesterId, resolvedAt: { gte: cutoff } } }),
        prisma.ticket.findMany({
          where: { requesterId },
          orderBy: { updatedAt: "desc" },
          take: 5,
          select: {
            id: true,
            ticketNumber: true,
            summary: true,
            currentStatus: true,
            updatedAt: true,
          },
        }),
      ]);

    res.status(200).json({
      metrics: { open, inProgress, waitingForMe, resolved, closed, recentlyResolved },
      myRecentTickets: recent.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        summary: t.summary,
        currentStatus: t.currentStatus,
        updatedAt: t.updatedAt,
      })),
    });
  }
);

export default router;
