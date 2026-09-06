// Seeds reference data for TokTickIT.
// Uses upsert so re-running the seed never creates duplicates (idempotent).
// Lab 1: Categories
// Lab 2: DevRequesters (4 active + 1 inactive), RelatedSystems (6 active + 1 inactive)

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CATEGORIES = ["Account and Access", "Hardware", "Software", "Network"];

const DEV_REQUESTERS = [
  { name: "Alice Johnson",  email: "alice@example.com",   isActive: true  },
  { name: "Bob Smith",      email: "bob@example.com",     isActive: true  },
  { name: "Carol Davis",    email: "carol@example.com",   isActive: true  },
  { name: "David Wilson",   email: "david@example.com",   isActive: true  },
  { name: "Eve Martinez",   email: "eve@example.com",     isActive: false },
];

const RELATED_SYSTEMS = [
  { name: "Email",                      isActive: true  },
  { name: "Campus Wi-Fi",               isActive: true  },
  { name: "VPN",                        isActive: true  },
  { name: "Student Information System", isActive: true  },
  { name: "Learning Management System", isActive: true  },
  { name: "Library Database",           isActive: true  },
  { name: "Legacy CRM",                 isActive: false },
];

async function main() {
  for (const name of CATEGORIES) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${CATEGORIES.length} categories.`);

  for (const r of DEV_REQUESTERS) {
    await prisma.devRequester.upsert({
      where: { email: r.email },
      update: { name: r.name, isActive: r.isActive },
      create: r,
    });
  }
  const activeCount = DEV_REQUESTERS.filter((r) => r.isActive).length;
  const inactiveCount = DEV_REQUESTERS.filter((r) => !r.isActive).length;
  console.log(
    `Seeded ${DEV_REQUESTERS.length} dev requesters (${activeCount} active, ${inactiveCount} inactive).`
  );

  for (const s of RELATED_SYSTEMS) {
    await prisma.relatedSystem.upsert({
      where: { name: s.name },
      update: { isActive: s.isActive },
      create: s,
    });
  }
  const activeSys = RELATED_SYSTEMS.filter((s) => s.isActive).length;
  const inactiveSys = RELATED_SYSTEMS.filter((s) => !s.isActive).length;
  console.log(
    `Seeded ${RELATED_SYSTEMS.length} related systems (${activeSys} active, ${inactiveSys} inactive).`
  );
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
