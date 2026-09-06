// Builds the Express app. Kept separate from index.ts (server startup)
// so Supertest can import the app directly without opening a real port.
import express from "express";
import cors from "cors";
import healthRouter from "./routes/health";
import categoriesRouter from "./routes/categories";
import devRequestersRouter from "./routes/dev-requesters";
import relatedSystemsRouter from "./routes/related-systems";
import ticketsRouter from "./routes/tickets";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use("/api/health", healthRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/dev-requesters", devRequestersRouter);
  app.use("/api/related-systems", relatedSystemsRouter);
  app.use("/api/tickets", ticketsRouter);

  return app;
}
