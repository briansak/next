import { prisma } from "@/lib/db";
import type { MentionUser } from "@/lib/heuristics/mentions";

export async function getTenantMembers(tenantId: string): Promise<MentionUser[]> {
  const members = await prisma.tenantMember.findMany({
    where: { tenantId },
    include: { user: true },
  });

  return members.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    email: m.user.email,
  }));
}
