// Single shared Prisma Client instance for the whole backend.
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
