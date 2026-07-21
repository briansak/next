import type { PartnerAskItem } from "./partner-asks";
import { evaluateStaleSla, type StaleSlaInfo } from "./stale-sla";
import type { CommitmentLedgerItem } from "@/lib/commitments/sync";

export interface MorningBriefMeeting {
  id: string;
  subject: string | null;
  receivedAt: Date;
  hoursUntil: number;
  label: string;
}

export interface MorningBriefPriority {
  id: string;
  headline: string;
  detail: string;
  href: string;
  kind: "stale-ask" | "meeting" | "commitment" | "mention" | "planning";
}

export interface MorningBrief {
  greeting: string;
  generatedAt: Date;
  priorities: MorningBriefPriority[];
  upcomingMeetings: MorningBriefMeeting[];
  staleAskCount: number;
  openCommitmentCount: number;
  summaryLine: string;
}

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function buildMorningBrief(input: {
  userName: string | null;
  now?: Date;
  partnerAsks: PartnerAskItem[];
  staleAsks: Array<PartnerAskItem & { sla: StaleSlaInfo }>;
  upcomingMeetings: MorningBriefMeeting[];
  commitments: CommitmentLedgerItem[];
  planningEventCount: number;
  mentionedCount: number;
}): MorningBrief {
  const now = input.now ?? new Date();
  const name = input.userName?.split(" ")[0] ?? "there";
  const greeting = `${greetingForHour(now.getHours())}, ${name}`;

  const priorities: MorningBriefPriority[] = [];

  for (const ask of input.staleAsks.slice(0, 2)) {
    priorities.push({
      id: `stale-${ask.communicationId}`,
      headline: ask.sla.label === "Overdue" ? "Overdue partner ask" : "Partner ask aging",
      detail: ask.ask.slice(0, 120),
      href: `/dashboard/${ask.communicationId}`,
      kind: "stale-ask",
    });
  }

  for (const meeting of input.upcomingMeetings.slice(0, 2)) {
    priorities.push({
      id: `meeting-${meeting.id}`,
      headline: meeting.label,
      detail: meeting.subject ?? "Upcoming meeting",
      href: `/dashboard/${meeting.id}`,
      kind: "meeting",
    });
  }

  const myCommitments = input.commitments.filter((c) => c.owner === "ME").slice(0, 2);
  for (const commitment of myCommitments) {
    priorities.push({
      id: `commitment-${commitment.id}`,
      headline: "Your open commitment",
      detail: commitment.title.slice(0, 120),
      href: commitment.communicationId
        ? `/dashboard/${commitment.communicationId}`
        : "/dashboard",
      kind: "commitment",
    });
  }

  if (input.planningEventCount > 0 && priorities.length < 3) {
    priorities.push({
      id: "planning",
      headline: `${input.planningEventCount} event${input.planningEventCount === 1 ? "" : "s"} need prep`,
      detail: "Review plan-ahead items and add prep to-dos.",
      href: "/dashboard",
      kind: "planning",
    });
  }

  const summaryParts: string[] = [];
  if (input.staleAsks.length > 0) {
    summaryParts.push(
      `${input.staleAsks.length} partner ask${input.staleAsks.length === 1 ? "" : "s"} past SLA`
    );
  }
  if (input.upcomingMeetings.length > 0) {
    summaryParts.push(
      `${input.upcomingMeetings.length} meeting${input.upcomingMeetings.length === 1 ? "" : "s"} in the next 48h`
    );
  }
  const openMine = input.commitments.filter((c) => c.owner === "ME").length;
  if (openMine > 0) {
    summaryParts.push(`${openMine} commitment${openMine === 1 ? "" : "s"} on you`);
  }
  if (input.mentionedCount > 0) {
    summaryParts.push(`${input.mentionedCount} recent @mention${input.mentionedCount === 1 ? "" : "s"}`);
  }

  const summaryLine =
    summaryParts.length > 0
      ? summaryParts.join(" · ")
      : "You're caught up — no urgent partner follow-ups detected.";

  return {
    greeting,
    generatedAt: now,
    priorities: priorities.slice(0, 3),
    upcomingMeetings: input.upcomingMeetings.slice(0, 4),
    staleAskCount: input.staleAsks.length,
    openCommitmentCount: input.commitments.length,
    summaryLine,
  };
}

export function enrichPartnerAsksWithSla(
  asks: PartnerAskItem[],
  now = new Date(),
  slaHours?: number
): Array<PartnerAskItem & { sla: StaleSlaInfo }> {
  return asks
    .map((ask) => ({
      ...ask,
      sla: evaluateStaleSla(ask.receivedAt, { now, slaHours }),
    }))
    .filter((ask) => ask.sla.severity !== "ok");
}

export function upcomingMeetingLabel(hoursUntil: number): string {
  if (hoursUntil <= 2) return "Starting soon";
  if (hoursUntil <= 24) return "Today";
  return "Tomorrow";
}

export function hoursUntil(date: Date, now = new Date()): number {
  return Math.max(0, (date.getTime() - now.getTime()) / (1000 * 60 * 60));
}
