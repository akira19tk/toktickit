// GET /api/related-systems — returns only active RelatedSystems
import { Router, type Request, type Response } from "express";
import { prisma } from "../prismaClient";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const systems = await prisma.relatedSystem.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    });
    res.status(200).json(systems);
  } catch {
    res.status(500).json({ error: "Unable to load related systems" });
  }
});

export default router;
