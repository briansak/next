import { prisma } from "../src/lib/db";
import { getWebexAccessToken } from "../src/lib/integrations/webex/ingest";
import { getWebexScopes } from "../src/lib/integrations/webex";
import { daysAgoIso } from "../src/lib/integrations/webex/meetings";

async function probe(label: string, url: string, token: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // keep text
  }
  const items =
    parsed && typeof parsed === "object" && "items" in parsed
      ? (parsed as { items: unknown[] }).items
      : null;
  console.log(`\n=== ${label} ===`);
  console.log("URL:", url);
  console.log("Status:", res.status);
  if (items) {
    console.log("Item count:", items.length);
    if (items[0]) {
      console.log("First item keys:", Object.keys(items[0] as object));
      console.log("First item sample:", JSON.stringify(items[0], null, 2).slice(0, 800));
    }
  } else {
    console.log("Body:", text.slice(0, 500));
  }
}

async function main() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    console.log("No tenant");
    return;
  }

  const token = await getWebexAccessToken(tenant.id);
  if (!token) {
    console.log("No Webex token");
    return;
  }

  const meetingCount = await prisma.communication.count({
    where: { source: "WEBEX_MEETING" },
  });
  console.log("Scopes configured:", getWebexScopes());
  console.log("WEBEX_MEETING records in DB:", meetingCount);

  const from = daysAgoIso(14);
  const to = new Date().toISOString();
  const base = "https://webexapis.com/v1";

  await probe(
    "List meetings (current code: meetingType=meeting)",
    `${base}/meetings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&max=10&meetingType=meeting`,
    token
  );

  await probe(
    "List meetings (no meetingType filter)",
    `${base}/meetings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&max=10`,
    token
  );

  await probe(
    "List recordings",
    `${base}/recordings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&max=5`,
    token
  );

  const members = await prisma.user.findMany({
    where: { memberships: { some: { tenantId: tenant.id } } },
    select: { email: true },
  });
  console.log("\nTenant member emails:", members.map((m) => m.email));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
