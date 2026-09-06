import type { PrismaClient } from "@prisma/client";

export function formatTicketNumber(year: number, seq: number): string {
  return `TKT-${year}-${seq.toString().padStart(6, "0")}`;
}

// Increments the per-year counter inside the caller's transaction and returns
// a formatted ticket number. Must be called within prisma.$transaction().
export async function generateTicketNumber(prisma: PrismaClient): Promise<string> {
  const year = new Date().getFullYear();
  const counter = await prisma.ticketCounter.upsert({
    where: { year },
    update: { count: { increment: 1 } },
    create: { year, count: 1 },
  });
  return formatTicketNumber(year, counter.count);
}
