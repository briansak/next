import type { Priority } from "@prisma/client";
import { scoreToPriority } from "./index";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** One-off events within this window get proactive planning attention. */
export const PLANNING_HORIZON_DAYS = 28;
export const PLANNING_MIN_DAYS_OUT = 1;

const PLANNING_KEYWORDS = [
  /\bworkshop\b/i,
  /\bkickoff\b/i,
  /\bkick-off\b/i,
  /\bQBR\b/i,
  /\bquarterly\b/i,
  /\bexecutive\b/i,
  /\bonsite\b/i,
  /\bon-site\b/i,
  /\bvisit\b/i,
  /\bdemo\b/i,
  /\bpresentation\b/i,
  /\bplanning\b/i,
  /\bprepare\b/i,
  /\bcoordination\b/i,
  /\bstrategy\b/i,
  /\breview\b/i,
  /\[WWT\]/i,
];

const ROUTINE_TITLE_PATTERNS = [
  /\bstand[- ]?up\b/i,
  /\b1:1\b/i,
  /\bone[- ]on[- ]one\b/i,
  /\bweekly\b/i,
  /\bdaily\b/i,
  /\boffice hours\b/i,
  /\bteam sync\b/i,
  /\brecurring\b/i,
];

const CALENDAR_HOLD_PATTERNS = [
  /\bPTO\b/i,
  /\bpaid time off\b/i,
  /\bout of office\b/i,
  /\bOOO\b/i,
  /\bvacation\b/i,
  /\bon leave\b/i,
  /\bholiday\b/i,
  /\bfocus time\b/i,
  /\bblock(ed)?\b/i,
  /\bhold\b/i,
  /\bno meetings\b/i,
];

export interface CalendarPlanningInput {
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end?: Date;
  attendeeEmails: string[];
  organizerEmail?: string;
  organizerName?: string;
  isRecurring?: boolean;
  isAllDay?: boolean;
  partnerDomains?: string[];
  now?: Date;
}

export interface CalendarPlanningResult {
  priority: Priority;
  priorityScore: number;
  priorityReasons: string[];
  summary: string;
  suggestedAction?: string;
  tags: string[];
  needsPlanning: boolean;
  daysUntil: number;
  durationMinutes: number;
  externalAttendees: string[];
}

export function eventDurationMinutes(start: Date, end?: Date): number {
  if (!end) return 60;
  const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  return minutes > 0 ? minutes : 60;
}

export function daysUntilEvent(start: Date, now = new Date()): number {
  return Math.floor((start.getTime() - now.getTime()) / MS_PER_DAY);
}

export function isRoutineCalendarTitle(summary: string): boolean {
  return ROUTINE_TITLE_PATTERNS.some((pattern) => pattern.test(summary));
}

export function isCalendarHoldTitle(summary: string, description?: string): boolean {
  const text = [summary, description].filter(Boolean).join(" ");
  return CALENDAR_HOLD_PATTERNS.some((pattern) => pattern.test(text));
}

/** PTO, OOO, and routine meetings should not surface as actionable priorities. */
export function isNonPlanningCalendarEvent(tags: string[]): boolean {
  return tags.includes("calendar-hold") || tags.includes("routine");
}

export function hasPlanningSignals(text: string): boolean {
  return PLANNING_KEYWORDS.some((pattern) => pattern.test(text));
}

function externalAttendeeEmails(
  attendees: string[],
  partnerDomains: string[] = ["wwt.com"]
): string[] {
  return attendees.filter((email) => {
    const domain = email.split("@")[1]?.toLowerCase();
    return domain ? partnerDomains.includes(domain) : false;
  });
}

export function analyzeCalendarEvent(
  input: CalendarPlanningInput
): CalendarPlanningResult {
  const now = input.now ?? new Date();
  const daysUntil = daysUntilEvent(input.start, now);
  const durationMinutes = eventDurationMinutes(input.start, input.end);
  const text = [input.summary, input.description, input.location]
    .filter(Boolean)
    .join(" ");

  const reasons: string[] = [];
  const tags: string[] = ["calendar"];
  let score = 0;

  const recurring = input.isRecurring === true;
  const future = daysUntil >= 0;
  const inPlanningWindow =
    daysUntil >= PLANNING_MIN_DAYS_OUT && daysUntil <= PLANNING_HORIZON_DAYS;
  const externalAttendees = externalAttendeeEmails(
    input.attendeeEmails,
    input.partnerDomains
  );
  const multiParty =
    input.attendeeEmails.length >= 2 || externalAttendees.length >= 1;
  const planningKeywords = hasPlanningSignals(text);
  const routine = isRoutineCalendarTitle(input.summary);
  const calendarHold = isCalendarHoldTitle(input.summary, input.description);
  const longEvent = durationMinutes >= 90;

  if (recurring) {
    tags.push("recurring");
    reasons.push("Recurring series — skipped for proactive planning");
    return buildResult({
      score: 1,
      reasons,
      tags,
      input,
      daysUntil,
      durationMinutes,
      externalAttendees,
      needsPlanning: false,
    });
  }

  tags.push("one-off");

  if (!future) {
    reasons.push("Event already started or passed");
    return buildResult({
      score: Math.max(1, score),
      reasons,
      tags,
      input,
      daysUntil,
      durationMinutes,
      externalAttendees,
      needsPlanning: false,
    });
  }

  if (routine) {
    tags.push("routine");
    reasons.push("Looks like a routine meeting");
    return buildResult({
      score: 2,
      reasons,
      tags,
      input,
      daysUntil,
      durationMinutes,
      externalAttendees,
      needsPlanning: false,
    });
  }

  if (calendarHold && !planningKeywords) {
    tags.push("calendar-hold");
    reasons.push("Calendar hold or time off — no prep needed");
    return buildResult({
      score: 1,
      reasons,
      tags,
      input,
      daysUntil,
      durationMinutes,
      externalAttendees,
      needsPlanning: false,
    });
  }

  if (!inPlanningWindow) {
    if (daysUntil > PLANNING_HORIZON_DAYS) {
      reasons.push(`More than ${PLANNING_HORIZON_DAYS} days out`);
    } else if (daysUntil === 0) {
      reasons.push("Happening today — reactive, not planning");
    }
    return buildResult({
      score: 2,
      reasons,
      tags,
      input,
      daysUntil,
      durationMinutes,
      externalAttendees,
      needsPlanning: false,
    });
  }

  score = 4;
  tags.push("plan-ahead");
  reasons.push(`One-off event in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`);

  if (daysUntil <= 14) {
    score += 2;
    reasons.push("Inside two-week planning window");
    tags.push("soon");
  }

  if (multiParty) {
    score += 2;
    reasons.push("Multiple attendees — coordination likely");
    tags.push("coordination");
  }

  if (externalAttendees.length > 0) {
    score += 1;
    reasons.push(
      `Partner attendees: ${externalAttendees.slice(0, 3).join(", ")}`
    );
    tags.push("partner-meeting");
  }

  if (longEvent) {
    score += 2;
    reasons.push(`Longer session (${durationMinutes} min)`);
    tags.push("big-rock");
  }

  if (planningKeywords) {
    score += 2;
    reasons.push("Title or description suggests preparation");
    tags.push("needs-prep");
  }

  if (input.location?.trim()) {
    score += 1;
    reasons.push("Has location — may need logistics");
  }

  score = Math.min(10, score);

  return buildResult({
    score,
    reasons,
    tags,
    input,
    daysUntil,
    durationMinutes,
    externalAttendees,
    needsPlanning: score >= 5,
  });
}

function buildResult(args: {
  score: number;
  reasons: string[];
  tags: string[];
  input: CalendarPlanningInput;
  daysUntil: number;
  durationMinutes: number;
  externalAttendees: string[];
  needsPlanning: boolean;
}): CalendarPlanningResult {
  const {
    score,
    reasons,
    tags,
    input,
    daysUntil,
    durationMinutes,
    externalAttendees,
    needsPlanning,
  } = args;

  const priority = scoreToPriority(score);
  const summary = `${input.summary} — ${formatDaysUntil(daysUntil)}`;

  let suggestedAction: string | undefined;
  if (needsPlanning) {
    if (externalAttendees.length > 0) {
      const names = externalAttendees.slice(0, 2).join(", ");
      suggestedAction = `Coordinate with ${names} before ${input.summary}`;
    } else if (input.organizerEmail) {
      suggestedAction = `Connect with ${input.organizerName ?? input.organizerEmail} to prepare`;
    } else if (tags.includes("needs-prep")) {
      suggestedAction = `Prepare materials and agenda for ${input.summary}`;
    } else {
      suggestedAction = `Plan ahead for ${input.summary}`;
    }
  }

  return {
    priority,
    priorityScore: score,
    priorityReasons: reasons,
    summary,
    suggestedAction,
    tags,
    needsPlanning,
    daysUntil,
    durationMinutes,
    externalAttendees,
  };
}

export function formatDaysUntil(daysUntil: number): string {
  if (daysUntil === 0) return "today";
  if (daysUntil === 1) return "tomorrow";
  if (daysUntil < 7) return `in ${daysUntil} days`;
  if (daysUntil < 14) return "in 1–2 weeks";
  return `in ${Math.round(daysUntil / 7)} weeks`;
}

export interface PlanningDashboardScoreInput {
  baseScore: number;
  start: Date;
  tags: string[];
  needsPlanning: boolean;
  now?: Date;
}

export function computePlanningDashboardScore(
  input: PlanningDashboardScoreInput
): { score: number; priority: Priority; adjustments: string[] } {
  const now = input.now ?? new Date();
  const adjustments: string[] = [];
  let score = input.baseScore;
  const daysUntil = daysUntilEvent(input.start, now);

  if (input.needsPlanning && daysUntil >= PLANNING_MIN_DAYS_OUT) {
    if (daysUntil <= 7) {
      score += 2;
      adjustments.push("Coming up this week");
    } else if (daysUntil <= 14) {
      score += 1;
      adjustments.push("Two-week planning horizon");
    }
  }

  if (input.tags.includes("big-rock") || input.tags.includes("rock-event")) {
    score += 1;
    adjustments.push("High-effort event");
  }

  score = Math.max(0, Math.min(10, score));
  return { score, priority: scoreToPriority(score), adjustments };
}
