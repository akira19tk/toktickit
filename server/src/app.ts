// Builds the Express app. Kept separate from index.ts (server startup)
// so Supertest can import the app directly without opening a real port.
import express from "express";
import cors from "cors";
import healthRouter from "./routes/health";
import categoriesRouter from "./routes/categories";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use("/api/health", healthRouter);
  app.use("/api/categories", categoriesRouter);

  return app;
}
