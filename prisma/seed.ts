import { readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";

// tsx does not auto-load .env — load it before Prisma connects
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
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";
  const adminName = process.env.SEED_ADMIN_NAME ?? "WWT Admin";

  console.log("Seeding WWT tenant…");

  const tenant = await prisma.tenant.upsert({
    where: { slug: "wwt" },
    update: {},
    create: {
      name: "WWT Coverage Team",
      slug: "wwt",
      partner: {
        create: { name: "World Wide Technology" },
      },
    },
    include: { partner: true },
  });

  const passwordHash = await hashPassword(adminPassword);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash, name: adminName },
    create: {
      email: adminEmail,
      name: adminName,
      passwordHash,
      memberships: {
        create: {
          tenantId: tenant.id,
          role: "ADMIN",
        },
      },
    },
  });

  const emailPolicy = await prisma.ingestionPolicy.upsert({
    where: { id: "seed-wwt-email-policy" },
    update: {},
    create: {
      id: "seed-wwt-email-policy",
      tenantId: tenant.id,
      source: "EMAIL",
      name: "WWT partner email",
      status: "DRAFT",
      description:
        "Ingest email from @wwt.com senders via the shared Microsoft 365 mailbox. Activate after connecting M365.",
      emailAllowlists: {
        create: [
          { fromDomain: "wwt.com" },
          { subjectPrefix: "[WWT]" },
        ],
      },
    },
  });

  const webexPolicy = await prisma.ingestionPolicy.upsert({
    where: { id: "seed-wwt-webex-policy" },
    update: {},
    create: {
      id: "seed-wwt-webex-policy",
      tenantId: tenant.id,
      source: "WEBEX",
      name: "WWT Webex spaces",
      status: "DRAFT",
      description:
        "Add specific Webex space IDs for WWT partner conversations. No spaces are synced until added.",
    },
  });

  console.log("Seed complete:");
  console.log(`  Tenant:  ${tenant.name} (${tenant.slug})`);
  console.log(`  Partner: ${tenant.partner?.name}`);
  console.log(`  Admin:   ${admin.email}`);
  console.log(`  Policies: ${emailPolicy.name}, ${webexPolicy.name} (both DRAFT)`);
  console.log("");
  console.log("Sign in with:");
  console.log(`  Email:    ${adminEmail}`);
  console.log(`  Password: ${adminPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
