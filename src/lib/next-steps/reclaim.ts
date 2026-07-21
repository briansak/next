import { prisma } from "@/lib/db";
import { isDayJobCommunication } from "@/lib/communications/space-purpose";
import {
  viewerMentionedInText,
  type MentionUser,
} from "@/lib/heuristics/mentions";
import { extractDueDateFromText } from "@/lib/heuristics/parse-manual-next-step";

const PERSONAL_TITLE_RE =
  /^Respond — you were @mentioned$|^Answer the question in this email$/i;

interface CommunicationMetadata {
  mentionedUserIds?: string[];
  directedRecipientUserIds?: string[];
}

/** Re-link next steps orphaned when users were deleted (assigneeId cleared). */
export async function reclaimOrphanedNextSteps(input: {
    userId: string;
  viewer: MentionUser;
  now?: Date;
}): Promise<number> {
  const now = input.now ?? new Date();
  let reclaimed = 0;

  const manual = await prisma.nextStep.updateMany({
    where: {
      communicationId: null,
      assigneeId: null,
      status: { in: ["OPEN", "IN_PROGRESS"] },
    },
    data: {
      assigneeId: input.userId,
      createdById: input.userId,
    },
  });
  reclaimed += manual.count;

  const manualWithoutDue = await prisma.nextStep.findMany({
    where: {
      communicationId: null,
      dueAt: null,
      status: { in: ["OPEN", "IN_PROGRESS"] },
    },
    select: { id: true, title: true, description: true },
  });
  for (const step of manualWithoutDue) {
    const dueAt = extractDueDateFromText(
      [step.title, step.description].filter(Boolean).join("\n"),
      now
    );
    if (!dueAt) continue;
    await prisma.nextStep.update({
      where: { id: step.id },
      data: { dueAt },
    });
  }

  const soloTenant = true;

  const futureCalendar = await prisma.nextStep.updateMany({
    where: {
      assigneeId: null,
      status: { in: ["OPEN", "IN_PROGRESS"] },
      communication: {
        source: "OUTLOOK_CALENDAR",
        receivedAt: { gt: now },
      },
    },
    data: {
      assigneeId: input.userId,
      createdById: input.userId,
    },
  });
  reclaimed += futureCalendar.count;

  const orphans = await prisma.nextStep.findMany({
    where: {
      assigneeId: null,
      status: { in: ["OPEN", "IN_PROGRESS"] },
      communicationId: { not: null },
    },
    select: {
      id: true,
      title: true,
      communication: {
        select: {
          source: true,
          subject: true,
          body: true,
          metadata: true,
        },
      },
    },
    take: 500,
  });

  for (const step of orphans) {
    const communication = step.communication;
    if (!communication) continue;
    if (!isDayJobCommunication(communication.source, communication.metadata)) {
      continue;
    }

    const meta = (communication.metadata ?? {}) as CommunicationMetadata;
    const text = [communication.subject, communication.body]
      .filter(Boolean)
      .join("\n");
    const mentionedYou =
      meta.mentionedUserIds?.includes(input.userId) ||
      viewerMentionedInText(text, input.viewer);
    const directedYou = meta.directedRecipientUserIds?.includes(input.userId);

    if (!PERSONAL_TITLE_RE.test(step.title.trim())) continue;
    if (!soloTenant && !mentionedYou && !directedYou) continue;

    await prisma.nextStep.update({
      where: { id: step.id },
      data: {
        assigneeId: input.userId,
        createdById: input.userId,
      },
    });
    reclaimed += 1;
  }

  return reclaimed;
}
