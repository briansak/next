import { readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";

try {
  const envPath = resolve(__dirname, "../.env");
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
} catch {
  // .env optional if vars are already in environment
}

const prisma = new PrismaClient();

async function main() {
  const partnerName = process.env.SEED_PARTNER_NAME?.trim() || "Acme Corp";
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";
  const adminName = process.env.SEED_ADMIN_NAME ?? "Admin";

  console.log("Seeding local single-user app…");

  let adminSummary: string | null = null;

  if (adminEmail) {
    const passwordHash = await hashPassword(adminPassword);
    const admin = await prisma.user.upsert({
      where: { email: adminEmail },
      update: {
        passwordHash,
        name: adminName,
        partnerName,
      },
      create: {
        email: adminEmail,
        name: adminName,
        passwordHash,
        partnerName,
      },
    });
    adminSummary = `${admin.email} / ${adminPassword}`;
  }

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
  console.log(`  Partner: ${partnerName}`);
  if (adminSummary) {
    console.log(`  User:    ${adminSummary}`);
  } else {
    console.log("  User:    (none — register at /register to create your account)");
  }
  console.log(`  Policies: ${emailPolicy.name}, ${webexPolicy.name} (both DRAFT)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
