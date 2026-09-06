// POST /api/tickets  — create Ticket + optional attachments (Issue #3)
// GET  /api/tickets  — list own tickets with search/filter/sort/pagination (Issue #4)
// GET  /api/tickets/:id — retrieve one owned Ticket (Issue #4 backend)
import { Router, type Request, type Response } from "express";
import multer from "multer";
import path from "path";
import { promises as fs } from "fs";
import { mkdirSync } from "fs";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../prismaClient";
import { generateTicketNumber } from "../lib/ticketNumber";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "lab-02");
mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIMETYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const ALLOWED_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_ATTACHMENTS = 5;

// Accept all files in memory; per-file validation happens after multer.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // generous multer limit; real limit enforced below
});

const router = Router();

// ── helpers ────────────────────────────────────────────────────────────────

function parseRequesterId(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ── GET /api/tickets helpers ────────────────────────────────────────────────

function parsePage(raw: unknown, defaultVal: number, max?: number): number {
  const n = parseInt(String(raw ?? ""), 10);
  if (!Number.isInteger(n) || n < 1) return defaultVal;
  if (max !== undefined && n > max) return defaultVal;
  return n;
}

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
  const status = statusRaw === "NEW" ? ("NEW" as const) : undefined;

  return { page, pageSize, sortBy, sortDir, search, categoryId, priority, status };
}

interface FieldErrors {
  [key: string]: string;
}

function validateCoreFields(body: Record<string, unknown>): FieldErrors {
  const errors: FieldErrors = {};

  // requestedPriority
  const priority = String(body.requestedPriority ?? "").trim();
  if (!["LOW", "MEDIUM", "HIGH"].includes(priority)) {
    errors.requestedPriority = "Requested priority must be LOW, MEDIUM, or HIGH";
  }

  // summary
  const summary = String(body.summary ?? "").trim();
  if (!summary || summary.length < 5 || summary.length > 120) {
    errors.summary = "Summary must be 5–120 characters";
  }

  // description
  const description = String(body.description ?? "").trim();
  if (!description || description.length < 10 || description.length > 2000) {
    errors.description = "Description must be 10–2000 characters";
  }

  // categoryId — coercible to positive integer (DB existence checked separately)
  const catId = Number(body.categoryId);
  if (!Number.isInteger(catId) || catId <= 0) {
    errors.categoryId = "Category not found or inactive";
  }

  // relatedSystemId
  const sysId = Number(body.relatedSystemId);
  if (!Number.isInteger(sysId) || sysId <= 0) {
    errors.relatedSystemId = "Related system not found or inactive";
  }

  return errors;
}

// ── GET /api/tickets ────────────────────────────────────────────────────────

router.get("/", async (req: Request, res: Response) => {
  const requesterId = parseRequesterId(req.headers["x-requester-id"]);
  if (requesterId === null) {
    res.status(400).json({ error: "x-requester-id header must be a positive integer" });
    return;
  }

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
      include: { category: { select: { name: true } } },
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
      currentStatus: t.currentStatus,
      updatedAt: t.updatedAt,
    })),
    pagination: { page, pageSize, totalCount, totalPages },
  });
});

// ── GET /api/tickets/:id ─────────────────────────────────────────────────────

router.get("/:id", async (req: Request, res: Response) => {
  const requesterId = parseRequesterId(req.headers["x-requester-id"]);
  if (requesterId === null) {
    res.status(400).json({ error: "x-requester-id header must be a positive integer" });
    return;
  }

  const ticketId = parseInt(req.params.id, 10);
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, requesterId },
    include: {
      attachments: { where: { removedAt: null } },
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
    relatedSystemId: ticket.relatedSystemId,
    summary: ticket.summary,
    description: ticket.description,
    requestedPriority: ticket.requestedPriority,
    currentStatus: ticket.currentStatus,
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
    // 1. Parse and validate x-requester-id
    const requesterId = parseRequesterId(req.headers["x-requester-id"]);
    if (requesterId === null) {
      res.status(400).json({ error: "x-requester-id header must be a positive integer" });
      return;
    }

    // 2. Verify requester exists and is active (BR-19)
    const requester = await prisma.devRequester.findUnique({
      where: { id: requesterId },
    });
    if (!requester || !requester.isActive) {
      res.status(401).json({ error: "Requester not found or inactive" });
      return;
    }

    // 3. Validate core fields
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

    // 4. Verify category and relatedSystem are active (BR-10)
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

    // 5. Create ticket (with ticket number generation) in a transaction
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
        },
      });
    });

    // 6. Process attachments (BR-14, BR-15) — invalid files are reported, not fatal
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
        attachmentErrors.push({
          fileName: file.originalname,
          reason: "Unsupported file type",
        });
        continue;
      }

      if (file.size > MAX_FILE_BYTES) {
        attachmentErrors.push({
          fileName: file.originalname,
          reason: "File exceeds 5MB limit",
        });
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
      currentStatus: ticket.currentStatus,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      attachments: savedAttachments,
      attachmentErrors,
    });
  }
);

export default router;
