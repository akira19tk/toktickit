// Requester ticket routes (Lab 2 + Lab 3 additions)
// All routes require role REQUESTER (BR-21). Ownership is by session user id (BR-03).
// GET  /api/tickets          — list own tickets
// GET  /api/tickets/:id      — own ticket detail
// POST /api/tickets          — create ticket
// POST /api/tickets/:id/attachments
// GET  /api/tickets/:id/attachments/:attachmentId/download
// DELETE /api/tickets/:id/attachments/:attachmentId
import { Router, type Request, type Response, type RequestHandler } from "express";
import multer from "multer";
import path from "path";
import { promises as fs } from "fs";
import { mkdirSync } from "fs";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../prismaClient";
import { generateTicketNumber } from "../lib/ticketNumber";
import { requireRole } from "../middleware/auth";
import type { TicketStatus } from "@prisma/client";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "lab-02");
mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIMETYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const ALLOWED_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const router = Router();

// All routes in this router are REQUESTER-only (BR-21)
router.use(requireRole("REQUESTER") as RequestHandler);

// ── helpers ────────────────────────────────────────────────────────────────

function parsePage(raw: unknown, defaultVal: number, max?: number): number {
  const n = parseInt(String(raw ?? ""), 10);
  if (!Number.isInteger(n) || n < 1) return defaultVal;
  if (max !== undefined && n > max) return defaultVal;
  return n;
}

const VALID_STATUSES: ReadonlySet<string> = new Set([
  "NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER",
  "RESOLVED", "CLOSED", "REOPENED", "CANCELLED",
]);

function parseListQuery(query: Record<string, unknown>) {
  const page = parsePage(query.page, 1);
  const pageSize = parsePage(query.pageSize, 10, 50);

  const sortByRaw = String(query.sortBy ?? "").toLowerCase();
  const sortBy = sortByRaw === "ticketnumber" ? "ticketNumber" : "createdAt";
  const sortDirRaw = String(query.sortDir ?? "").toLowerCase();
  const sortDir: "asc" | "desc" = sortDirRaw === "asc" ? "asc" : "desc";

  const search = String(query.search ?? "").trim() || undefined;

  const catIdRaw = parseInt(String(query.categoryId ?? ""), 10);
  const categoryId =
    Number.isInteger(catIdRaw) && catIdRaw > 0 ? catIdRaw : undefined;

  const priorityRaw = String(query.priority ?? "").toUpperCase().trim();
  const priority = ["LOW", "MEDIUM", "HIGH"].includes(priorityRaw)
    ? (priorityRaw as "LOW" | "MEDIUM" | "HIGH")
    : undefined;

  const statusRaw = String(query.status ?? "").toUpperCase().trim();
  const status = VALID_STATUSES.has(statusRaw)
    ? (statusRaw as TicketStatus)
    : undefined;

  return { page, pageSize, sortBy, sortDir, search, categoryId, priority, status };
}

interface FieldErrors {
  [key: string]: string;
}

function validateCoreFields(body: Record<string, unknown>): FieldErrors {
  const errors: FieldErrors = {};

  const priority = String(body.requestedPriority ?? "").trim();
  if (!["LOW", "MEDIUM", "HIGH"].includes(priority)) {
    errors.requestedPriority = "Requested priority must be LOW, MEDIUM, or HIGH";
  }

  const summary = String(body.summary ?? "").trim();
  if (!summary || summary.length < 5 || summary.length > 120) {
    errors.summary = "Summary must be 5–120 characters";
  }

  const description = String(body.description ?? "").trim();
  if (!description || description.length < 10 || description.length > 2000) {
    errors.description = "Description must be 10–2000 characters";
  }

  const catId = Number(body.categoryId);
  if (!Number.isInteger(catId) || catId <= 0) {
    errors.categoryId = "Category not found or inactive";
  }

  const sysId = Number(body.relatedSystemId);
  if (!Number.isInteger(sysId) || sysId <= 0) {
    errors.relatedSystemId = "Related system not found or inactive";
  }

  return errors;
}

// ── GET /api/tickets ────────────────────────────────────────────────────────

router.get("/", async (req: Request, res: Response) => {
  const requesterId = req.user!.id;

  const { page, pageSize, sortBy, sortDir, search, categoryId, priority, status } =
    parseListQuery(req.query as Record<string, unknown>);

  const where = {
    requesterId,
    ...(search
      ? {
          OR: [
            { ticketNumber: { contains: search, mode: "insensitive" as const } },
            { summary: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(categoryId !== undefined ? { categoryId } : {}),
    ...(priority ? { requestedPriority: priority } : {}),
    ...(status ? { currentStatus: status } : {}),
  };

  const [tickets, totalCount] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: {
        category: { select: { name: true } },
        owner: { select: { name: true } },
      },
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ticket.count({ where }),
  ]);

  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);

  res.status(200).json({
    data: tickets.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      createdAt: t.createdAt,
      summary: t.summary,
      category: t.category.name,
      requestedPriority: t.requestedPriority,
      itPriority: t.itPriority,
      currentStatus: t.currentStatus,
      updatedAt: t.updatedAt,
      owner: t.owner ? { name: t.owner.name } : null,
    })),
    pagination: { page, pageSize, totalCount, totalPages },
  });
});

// ── GET /api/tickets/:id ─────────────────────────────────────────────────────

router.get("/:id", async (req: Request, res: Response) => {
  const requesterId = req.user!.id;

  const ticketId = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, requesterId },
    include: {
      category:      { select: { name: true } },
      relatedSystem: { select: { name: true } },
      attachments:   { where: { removedAt: null } },
      owner:         { select: { name: true } },
    },
  });

  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  res.status(200).json({
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    requesterId: ticket.requesterId,
    categoryId: ticket.categoryId,
    category: ticket.category.name,
    relatedSystemId: ticket.relatedSystemId,
    relatedSystem: ticket.relatedSystem.name,
    summary: ticket.summary,
    description: ticket.description,
    requestedPriority: ticket.requestedPriority,
    itPriority: ticket.itPriority,
    currentStatus: ticket.currentStatus,
    owner: ticket.owner ? { name: ticket.owner.name } : null,
    resolutionSummary: ticket.resolutionSummary,
    resolvedAt: ticket.resolvedAt,
    requesterResolvedAt: ticket.requesterResolvedAt,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    attachments: ticket.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      sizeBytes: a.sizeBytes,
      uploadedAt: a.uploadedAt,
    })),
  });
});

// ── POST /api/tickets ────────────────────────────────────────────────────────

router.post(
  "/",
  upload.array("attachments", MAX_ATTACHMENTS),
  async (req: Request, res: Response) => {
    const requesterId = req.user!.id;

    const fieldErrors = validateCoreFields(req.body as Record<string, unknown>);
    if (Object.keys(fieldErrors).length > 0) {
      res.status(400).json({ errors: fieldErrors });
      return;
    }

    const categoryId = Number(req.body.categoryId);
    const relatedSystemId = Number(req.body.relatedSystemId);
    const summary = String(req.body.summary).trim();
    const description = String(req.body.description).trim();
    const requestedPriority = String(req.body.requestedPriority).trim() as
      | "LOW"
      | "MEDIUM"
      | "HIGH";

    const [category, relatedSystem] = await Promise.all([
      prisma.category.findUnique({ where: { id: categoryId } }),
      prisma.relatedSystem.findUnique({ where: { id: relatedSystemId } }),
    ]);

    const dbErrors: FieldErrors = {};
    if (!category || !category.isActive) {
      dbErrors.categoryId = "Category not found or inactive";
    }
    if (!relatedSystem || !relatedSystem.isActive) {
      dbErrors.relatedSystemId = "Related system not found or inactive";
    }
    if (Object.keys(dbErrors).length > 0) {
      res.status(400).json({ errors: dbErrors });
      return;
    }

    const ticket = await prisma.$transaction(async (tx) => {
      const ticketNumber = await generateTicketNumber(tx as unknown as typeof prisma);
      return tx.ticket.create({
        data: {
          ticketNumber,
          requesterId,
          categoryId,
          relatedSystemId,
          summary,
          description,
          requestedPriority,
          itPriority: requestedPriority, // BR-25
        },
      });
    });

    const files = (req.files as Express.Multer.File[]) ?? [];
    const savedAttachments: Array<{
      id: number;
      fileName: string;
      sizeBytes: number;
      uploadedAt: Date;
    }> = [];
    const attachmentErrors: Array<{ fileName: string; reason: string }> = [];

    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase();

      if (!ALLOWED_EXTS.has(ext) || !ALLOWED_MIMETYPES.has(file.mimetype)) {
        attachmentErrors.push({ fileName: file.originalname, reason: "Unsupported file type" });
        continue;
      }

      if (file.size > MAX_FILE_BYTES) {
        attachmentErrors.push({ fileName: file.originalname, reason: "File exceeds 5MB limit" });
        continue;
      }

      const storedFileName = `${uuidv4()}${ext}`;
      const destPath = path.join(UPLOAD_DIR, storedFileName);
      await fs.writeFile(destPath, file.buffer);

      const attachment = await prisma.attachment.create({
        data: {
          ticketId: ticket.id,
          fileName: file.originalname,
          storedFileName,
          mimeType: file.mimetype,
          sizeBytes: file.size,
        },
      });

      savedAttachments.push({
        id: attachment.id,
        fileName: attachment.fileName,
        sizeBytes: attachment.sizeBytes,
        uploadedAt: attachment.uploadedAt,
      });
    }

    res.status(201).json({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      requesterId: ticket.requesterId,
      categoryId: ticket.categoryId,
      relatedSystemId: ticket.relatedSystemId,
      summary: ticket.summary,
      description: ticket.description,
      requestedPriority: ticket.requestedPriority,
      itPriority: ticket.itPriority,
      currentStatus: ticket.currentStatus,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      attachments: savedAttachments,
      attachmentErrors,
    });
  }
);

// ── POST /api/tickets/:id/attachments ────────────────────────────────────────

const uploadSingle = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.post(
  "/:id/attachments",
  uploadSingle.single("file"),
  async (req: Request, res: Response) => {
    const requesterId = req.user!.id;

    const ticketId = parseInt(String(req.params.id), 10);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, requesterId } });
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTS.has(ext) || !ALLOWED_MIMETYPES.has(file.mimetype)) {
      res.status(400).json({ error: "Unsupported file type" });
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      res.status(400).json({ error: "File exceeds 5MB limit" });
      return;
    }

    const activeCount = await prisma.attachment.count({
      where: { ticketId, removedAt: null },
    });
    if (activeCount >= MAX_ATTACHMENTS) {
      res.status(400).json({ error: "Ticket already has 5 active attachments" });
      return;
    }

    const storedFileName = `${uuidv4()}${ext}`;
    await fs.writeFile(path.join(UPLOAD_DIR, storedFileName), file.buffer);

    const attachment = await prisma.attachment.create({
      data: {
        ticketId,
        fileName: file.originalname,
        storedFileName,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    });

    res.status(201).json({
      id: attachment.id,
      fileName: attachment.fileName,
      sizeBytes: attachment.sizeBytes,
      uploadedAt: attachment.uploadedAt,
    });
  }
);

// ── GET /api/tickets/:id/attachments/:attachmentId/download ──────────────────

router.get(
  "/:id/attachments/:attachmentId/download",
  async (req: Request, res: Response) => {
    const requesterId = req.user!.id;

    const ticketId = parseInt(String(req.params.id), 10);
    const attachmentId = parseInt(String(req.params.attachmentId), 10);
    if (!Number.isInteger(ticketId) || !Number.isInteger(attachmentId)) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, requesterId } });
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const attachment = await prisma.attachment.findFirst({
      where: { id: attachmentId, ticketId },
    });
    if (!attachment) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }

    if (attachment.removedAt !== null) {
      res.status(410).json({ error: "Attachment has been removed" });
      return;
    }

    const filePath = path.join(UPLOAD_DIR, attachment.storedFileName);
    try {
      await fs.access(filePath);
    } catch {
      res.status(404).json({ error: "File not found on disk" });
      return;
    }

    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${attachment.fileName}"`
    );
    res.sendFile(filePath, { root: "/" });
  }
);

// ── DELETE /api/tickets/:id/attachments/:attachmentId ────────────────────────

router.delete(
  "/:id/attachments/:attachmentId",
  async (req: Request, res: Response) => {
    const requesterId = req.user!.id;

    const ticketId = parseInt(String(req.params.id), 10);
    const attachmentId = parseInt(String(req.params.attachmentId), 10);
    if (!Number.isInteger(ticketId) || !Number.isInteger(attachmentId)) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const reason = String((req.body as Record<string, unknown>).reason ?? "").trim();
    if (reason.length < 3) {
      res.status(400).json({ error: "Removal reason must be at least 3 characters" });
      return;
    }

    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, requesterId } });
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const attachment = await prisma.attachment.findFirst({
      where: { id: attachmentId, ticketId },
    });
    if (!attachment) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }

    if (attachment.removedAt !== null) {
      res.status(409).json({ error: "Attachment already removed" });
      return;
    }

    const updated = await prisma.attachment.update({
      where: { id: attachmentId },
      data: { removedAt: new Date(), removalReason: reason },
    });

    res.status(200).json({
      id: updated.id,
      removedAt: updated.removedAt,
      removalReason: updated.removalReason,
    });
  }
);

// ── Allowed statuses for Problem Appears Resolved (BR-40) ───────────────────

const RESOLVED_INDICATION_ALLOWED = new Set<TicketStatus>([
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "REOPENED",
]);

// ── GET /api/tickets/:id/comments ────────────────────────────────────────────

router.get("/:id/comments", async (req: Request, res: Response) => {
  const requesterId = req.user!.id;
  const ticketId = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }
  // Ownership check — BR-46: Requester may read only their own Ticket's comments
  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, requesterId } });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }
  const comments = await prisma.publicComment.findMany({
    where: { ticketId },
    include: { author: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.status(200).json(
    comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      author: { id: c.author.id, name: c.author.name, role: c.author.role },
    }))
  );
});

// ── POST /api/tickets/:id/comments ───────────────────────────────────────────

router.post("/:id/comments", async (req: Request, res: Response) => {
  const requesterId = req.user!.id;
  const ticketId = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }
  // Ownership check BEFORE validation (BR-24, BR-46)
  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, requesterId } });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }
  // Input validation (BR-42): trim then check 1–2000 chars
  const rawBody = String((req.body as Record<string, unknown>).body ?? "");
  const trimmedBody = rawBody.trim();
  if (!trimmedBody) {
    res.status(400).json({ errors: { body: "Comment body is required" } });
    return;
  }
  if (trimmedBody.length > 2000) {
    res.status(400).json({ errors: { body: "Comment body must not exceed 2000 characters" } });
    return;
  }
  // State conflict (BR-44): CLOSED or CANCELLED → 409 TICKET_CLOSED
  if (ticket.currentStatus === "CLOSED" || ticket.currentStatus === "CANCELLED") {
    res.status(409).json({
      error: "Cannot add comments to a closed or cancelled ticket",
      code: "TICKET_CLOSED",
    });
    return;
  }
  const comment = await prisma.publicComment.create({
    data: { ticketId, authorId: requesterId, body: trimmedBody },
    include: { author: { select: { id: true, name: true, role: true } } },
  });
  res.status(201).json({
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt,
    author: { id: comment.author.id, name: comment.author.name, role: comment.author.role },
  });
});

// ── POST /api/tickets/:id/resolved-indication ────────────────────────────────

router.post("/:id/resolved-indication", async (req: Request, res: Response) => {
  const requesterId = req.user!.id;
  const ticketId = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }
  // Ownership check BEFORE state check (BR-24)
  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, requesterId } });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }
  // State conflict (BR-40): only allowed in specific statuses
  if (!RESOLVED_INDICATION_ALLOWED.has(ticket.currentStatus)) {
    res.status(409).json({
      error: "Problem Appears Resolved is only allowed when the ticket is OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER or REOPENED",
      code: "INVALID_STATE",
    });
    return;
  }
  // Idempotent: if already indicated, return existing timestamp (BR-40)
  if (ticket.requesterResolvedAt !== null) {
    res.status(200).json({ requesterResolvedAt: ticket.requesterResolvedAt });
    return;
  }
  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: { requesterResolvedAt: new Date() },
  });
  res.status(200).json({ requesterResolvedAt: updated.requesterResolvedAt });
});

export default router;
