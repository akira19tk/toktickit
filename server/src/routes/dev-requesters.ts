// GET /api/dev-requesters — removed in Lab 3 (BR-61, AC-24)
// Returns 404 for all callers; mounted before auth middleware so there is no 401.
import { Router, type Request, type Response } from "express";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
});

export default router;
