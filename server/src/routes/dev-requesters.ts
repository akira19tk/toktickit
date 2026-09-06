// GET /api/dev-requesters — returns only active DevRequesters (BR-04)
import { Router, type Request, type Response } from "express";
import { prisma } from "../prismaClient";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const requesters = await prisma.devRequester.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, name: true, email: true },
    });
    res.status(200).json(requesters);
  } catch {
    res.status(500).json({ error: "Unable to load requesters" });
  }
});

export default router;
