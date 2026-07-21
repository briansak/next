import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding local single-user app…");

  const emailPolicy = await prisma.ingestionPolicy.upsert({
    where: { source: "EMAIL" },
    update: {},
    create: {
      source: "EMAIL",
      name: "Partner email",
      status: "DRAFT",
      description:
        "Configure partner domains and subject prefixes to boost priority on My Priorities.",
    },
  });

  const webexPolicy = await prisma.ingestionPolicy.upsert({
    where: { source: "WEBEX" },
    update: {},
    create: {
      source: "WEBEX",
      name: "Webex spaces",
      status: "DRAFT",
      description:
        "Add specific Webex space IDs for partner conversations. No spaces are synced until added.",
    },
  });

  console.log("Seed complete:");
  console.log("  User:    (none — complete first-launch setup in the app at /setup)");
  console.log(`  Policies: ${emailPolicy.name}, ${webexPolicy.name} (both DRAFT)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
