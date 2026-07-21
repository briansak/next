import { prisma } from "@/lib/db";
import type { Priority, Prisma } from "@prisma/client";
import { scoreToPriority } from "@/lib/heuristics";
import {
  buildClusterAssignments,
  classifyCalendarEventKind,
  conferenceRequiresTravel,
  missingTravelNextStepTitle,
  type CalendarClusterInput,
} from "@/lib/heuristics/calendar-event-clustering";
import { defaultPrepDueDate } from "@/lib/heuristics/event-prep-suggestions";
import { isCalendarHoldTitle, isRoutineCalendarTitle } from "@/lib/heuristics/calendar-planning";

const CLUSTER_LOOKAHEAD_DAYS = 90;

interface CalendarCommunicationRow {
  id: string;
  subject: string | null;
  body: string;
  receivedAt: Date;
  tags: string[];
  metadata: unknown;
}

function parseCalendarRow(row: CalendarCommunicationRow): CalendarClusterInput {
  const meta = (row.metadata ?? {}) as {
    endTime?: string;
    location?: string;
    isAllDay?: boolean;
  };

  return {
    id: row.id,
    subject: row.subject ?? "Untitled event",
    description: row.body,
    location: meta.location,
    start: row.receivedAt,
    end: meta.endTime ? new Date(meta.endTime) : undefined,
    isAllDay: meta.isAllDay,
    tags: row.tags,
  };
}

function mergeTags(existing: string[], additions: string[]): string[] {
  return [...new Set([...existing, ...additions])];
}

function applyKindTags(tags: string[], eventKind: string): string[] {
  const withoutKind = tags.filter(
    (tag) =>
      ![
        "rock-event",
        "travel-logistics",
        "travel-flight",
        "travel-hotel",
        "travel-other",
        "missing-travel",
      ].includes(tag)
  );

  if (eventKind === "conference") {
    return mergeTags(withoutKind, ["rock-event"]);
  }

  if (
    eventKind === "travel-flight" ||
    eventKind === "travel-hotel" ||
    eventKind === "travel-other"
  ) {
    return mergeTags(withoutKind, ["travel-logistics", eventKind]);
  }

  return withoutKind;
}

async function upsertMissingTravelNextStep(
    communicationId: string,
  subject: string,
  eventStart: Date,
  priority: Priority
): Promise<void> {
  const title = missingTravelNextStepTitle(subject);

  const existing = await prisma.nextStep.findFirst({
    where: {
      communicationId,
      status: "OPEN",
      OR: [
        { title: { equals: title, mode: "insensitive" } },
        { title: { contains: "book travel", mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });

  if (existing) return;

  await prisma.nextStep.create({
    data: {
      communicationId,
      title,
      priority: priority === "CRITICAL" || priority === "HIGH" ? "HIGH" : "MEDIUM",
      status: "OPEN",
      dueAt: defaultPrepDueDate(eventStart),
    },
  });
}

async function closeResolvedTravelNextSteps(
    communicationId: string
): Promise<number> {
  const closed = await prisma.nextStep.updateMany({
    where: {
      communicationId,
      status: "OPEN",
      title: { contains: "book travel", mode: "insensitive" },
    },
    data: { status: "DONE" },
  });
  return closed.count;
}

export interface ReconcileCalendarClustersResult {
  scanned: number;
  updated: number;
  missingTravelSteps: number;
  resolvedTravelSteps: number;
}

export async function reconcileCalendarEventClusters(
  ): Promise<ReconcileCalendarClustersResult> {
  const since = new Date();
  const until = new Date();
  until.setDate(until.getDate() + CLUSTER_LOOKAHEAD_DAYS);

  const rows = await prisma.communication.findMany({
    where: {
      source: "OUTLOOK_CALENDAR",
      receivedAt: { gte: since, lte: until },
      tags: { has: "calendar" },
    },
    select: {
      id: true,
      subject: true,
      body: true,
      receivedAt: true,
      tags: true,
      metadata: true,
      priority: true,
    },
    take: 500,
    orderBy: { receivedAt: "asc" },
  });

  if (rows.length === 0) {
    return { scanned: 0, updated: 0, missingTravelSteps: 0, resolvedTravelSteps: 0 };
  }

  const inputs = rows.map(parseCalendarRow);
  const assignments = buildClusterAssignments(inputs);

  let updated = 0;
  let missingTravelSteps = 0;
  let resolvedTravelSteps = 0;

  for (const row of rows) {
    const assignment = assignments.get(row.id);
    if (!assignment) continue;

    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const nextMeta = {
      ...meta,
      eventKind: assignment.eventKind,
      clusterId: assignment.clusterId,
      parentEventId: assignment.parentEventId,
      destinationHint: assignment.destinationHint,
      missingTravel: assignment.missingTravel,
      linkedTravelIds: assignment.linkedTravelIds,
    };

    const tags = applyKindTags(row.tags, assignment.eventKind);
    if (assignment.missingTravel) {
      tags.push("missing-travel");
    }

    const isCalendarNoise =
      tags.includes("calendar-hold") ||
      tags.includes("routine") ||
      isCalendarHoldTitle(row.subject ?? "", row.body) ||
      isRoutineCalendarTitle(row.subject ?? "");

    if (isCalendarNoise) {
      if (!tags.includes("calendar-hold") && isCalendarHoldTitle(row.subject ?? "", row.body)) {
        tags.push("calendar-hold");
      }
      if (!tags.includes("routine") && isRoutineCalendarTitle(row.subject ?? "")) {
        tags.push("routine");
      }
    }

    const metadataChanged = JSON.stringify(meta) !== JSON.stringify(nextMeta);
    const tagsChanged =
      tags.length !== row.tags.length ||
      tags.some((tag) => !row.tags.includes(tag));

    if (!metadataChanged && !tagsChanged && !isCalendarNoise) continue;

    let priority = row.priority;
    let priorityScore: number | undefined;

    if (isCalendarNoise) {
      priority = "INFO";
      priorityScore = 0;
    } else if (assignment.eventKind === "conference") {
      priorityScore = Math.min(10, 7 + (assignment.missingTravel ? 2 : 0));
      priority = scoreToPriority(priorityScore);
    } else if (assignment.parentEventId) {
      priority = "INFO";
      priorityScore = 2;
    }

    await prisma.communication.update({
      where: { id: row.id },
      data: {
        tags,
        ...(priorityScore != null ? { priority, priorityScore } : {}),
        metadata: nextMeta as Prisma.InputJsonValue,
      },
    });
    updated++;

    if (assignment.eventKind === "conference" && assignment.missingTravel) {
      await upsertMissingTravelNextStep(
        row.id,
        row.subject ?? "Upcoming event",
        row.receivedAt,
        priority
      );
      missingTravelSteps++;
    }

    if (assignment.eventKind === "conference" && !assignment.missingTravel) {
      resolvedTravelSteps += await closeResolvedTravelNextSteps( row.id);
    }
  }

  return {
    scanned: rows.length,
    updated,
    missingTravelSteps,
    resolvedTravelSteps,
  };
}

export function calendarEventKindFromInput(event: {
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end?: Date;
  isAllDay?: boolean;
}): ReturnType<typeof classifyCalendarEventKind> {
  return classifyCalendarEventKind({
    id: "pending",
    subject: event.summary,
    description: event.description,
    location: event.location,
    start: event.start,
    end: event.end,
    isAllDay: event.isAllDay,
  });
}

export function calendarKindTags(
  eventKind: ReturnType<typeof classifyCalendarEventKind>
): string[] {
  if (eventKind === "conference") return ["rock-event"];
  if (eventKind === "travel-flight" || eventKind === "travel-hotel" || eventKind === "travel-other") {
    return ["travel-logistics", eventKind];
  }
  return [];
}

export function calendarRequiresTravelFlag(event: {
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end?: Date;
  isAllDay?: boolean;
}): boolean {
  return conferenceRequiresTravel({
    id: "pending",
    subject: event.summary,
    description: event.description,
    location: event.location,
    start: event.start,
    end: event.end,
    isAllDay: event.isAllDay,
  });
}
