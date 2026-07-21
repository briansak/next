import { readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";

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
  // .env optional
}

const prisma = new PrismaClient();

async function main() {
  const sessions = await prisma.session.deleteMany();
  const users = await prisma.user.deleteMany();

  console.log("User database reset:");
  console.log(`  Sessions removed: ${sessions.count}`);
  console.log(`  Users removed:    ${users.count}`);
  console.log("");
  console.log("Ingestion policies and integration tokens were kept.");
  console.log("Open /setup to complete the first-launch questionnaire.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
