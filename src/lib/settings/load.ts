import { prisma } from "@/lib/db";
import { getWebexConfig } from "@/lib/integrations/webex";

export async function loadSettingsData(userId: string) {
  const policies = await prisma.ingestionPolicy
    .findMany({
      include: {
        webexAllowlists: true,
        emailAllowlists: true,
      },
      orderBy: { source: "asc" },
    })
    .catch(() => []);

  const webexConnected = await prisma.integrationToken
    .findUnique({
      where: { provider: "WEBEX" },
    })
    .catch(() => null);

  const webexPolicy = policies.find((policy) => policy.source === "WEBEX");
  const emailPolicy = policies.find((policy) => policy.source === "EMAIL");

  const user = await prisma.user
    .findUnique({
      where: { id: userId },
      select: { partnerName: true },
    })
    .catch(() => null);

  return {
    policies,
    webexConnected,
    webexConfig: getWebexConfig(),
    webexPolicy,
    emailPolicy,
    partnerName: user?.partnerName ?? null,
    webexPolicyActive: webexPolicy?.status === "ACTIVE",
    emailPolicyActive: emailPolicy?.status === "ACTIVE",
    hasWebexSpaces: (webexPolicy?.webexAllowlists.length ?? 0) > 0,
  };
}
