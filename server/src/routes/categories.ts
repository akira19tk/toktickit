// GET /api/categories - Issue 4: return seeded categories from PostgreSQL via Prisma
import { Router, Request, Response } from "express";
import { prisma } from "../prismaClient";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    });
    res.status(200).json(categories);
  } catch (err) {
    res.status(500).json({
      error: "Unable to load categories from the database.",
    });
  }
});

export default router;
