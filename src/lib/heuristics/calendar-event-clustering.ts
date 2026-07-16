import { daysUntilEvent } from "./calendar-planning";

export type CalendarEventKind =
  | "conference"
  | "travel-flight"
  | "travel-hotel"
  | "travel-other"
  | "meeting";

export interface CalendarClusterInput {
  id: string;
  subject: string;
  description?: string;
  location?: string;
  start: Date;
  end?: Date;
  isAllDay?: boolean;
  tags?: string[];
}

export interface CalendarClusterAssignment {
  eventKind: CalendarEventKind;
  clusterId: string | null;
  parentEventId: string | null;
  destinationHint: string | null;
  missingTravel: boolean;
  linkedTravelIds: string[];
}

export interface CalendarClusterGroup {
  clusterId: string;
  parent: CalendarClusterInput;
  children: CalendarClusterInput[];
  missingTravel: boolean;
  destinationHint: string | null;
}

const CONFERENCE_PATTERNS = [
  /\bblack\s*hat\b/i,
  /\bdef\s*con\b/i,
  /\bDEFCON\b/,
  /\bcisco\s*live\b/i,
  /\b\.conf\d*\b/i,
  /\bRSA\s*(?:Conference|conference)\b/i,
  /\bVMware\s*Explore\b/i,
  /\bMicrosoft\s*Ignite\b/i,
  /\bAWS\s*re:Invent\b/i,
  /\bre:Invent\b/i,
  /\bSplunk\s*\.conf\b/i,
  /\bGITEX\b/i,
  /\bMWC\b/i,
  /\btrade\s*show\b/i,
  /\bconference\b/i,
  /\bsummit\b/i,
  /\bexpo\b/i,
  /\bfest\b/i,
];

const FLIGHT_PATTERNS = [
  /\b(?:united|delta|american|southwest|jetblue|alaska|frontier|spirit)\s*(?:flight|airlines?)?\b/i,
  /\bflight\s*(?:to|from|#)\b/i,
  /\b(?:depart|arrive|departure|arrival)\b/i,
  /\b[A-Z]{3}\s*(?:→|->|to)\s*[A-Z]{3}\b/,
  /\b(?:UA|AA|DL|WN|B6)\s*\d{2,4}\b/,
];

const HOTEL_PATTERNS = [
  /\b(?:marriott|hilton|hyatt|ihg|westin|sheraton|holiday\s*inn|motel|airbnb|vrbo)\b/i,
  /\bcheck[- ]?(?:in|out)\b/i,
  /\bhotel\b/i,
  /\bstay\s+at\b/i,
  /\breservation\b/i,
];

const VIRTUAL_LOCATION =
  /teams|zoom|webex|meet\.google|virtual|remote|phone|microsoft teams|online/i;

const CITY_ALIASES: Record<string, string[]> = {
  "las vegas": ["las vegas", "vegas", "las", "mccarran", "harry reid"],
  "san francisco": ["san francisco", "sfo", "moscone"],
  "orlando": ["orlando", "mco", "disney"],
  "chicago": ["chicago", "ord", "mdw", "mccormick"],
  "austin": ["austin", "aus"],
  "denver": ["denver", "den"],
  "boston": ["boston", "bos"],
  "atlanta": ["atlanta", "atl"],
  "dallas": ["dallas", "dfw", "love field"],
  "new york": ["new york", "nyc", "jfk", "lga", "ewr", "manhattan"],
  "washington": ["washington", "dca", "iad", "dc"],
  "seattle": ["seattle", "sea"],
};

function eventText(event: CalendarClusterInput): string {
  return [event.subject, event.description, event.location].filter(Boolean).join(" ");
}

function eventEnd(event: CalendarClusterInput): Date {
  if (event.end && event.end > event.start) return event.end;
  return new Date(event.start.getTime() + 60 * 60 * 1000);
}

function eventDurationHours(event: CalendarClusterInput): number {
  return (eventEnd(event).getTime() - event.start.getTime()) / (60 * 60 * 1000);
}

function isVirtualLocation(location?: string): boolean {
  if (!location?.trim()) return false;
  return VIRTUAL_LOCATION.test(location);
}

function extractDestinationHint(text: string, location?: string): string | null {
  const combined = `${text} ${location ?? ""}`.toLowerCase();
  for (const [city, aliases] of Object.entries(CITY_ALIASES)) {
    if (aliases.some((alias) => combined.includes(alias))) return city;
  }
  const loc = location?.trim();
  if (loc && !isVirtualLocation(loc) && loc.length >= 3) {
    return loc.split(",")[0]?.trim().toLowerCase() ?? null;
  }
  return null;
}

function destinationsMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return true;
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left === right) return true;
  for (const aliases of Object.values(CITY_ALIASES)) {
    if (aliases.includes(left) && aliases.includes(right)) return true;
  }
  return left.includes(right) || right.includes(left);
}

export function classifyCalendarEventKind(
  event: CalendarClusterInput
): CalendarEventKind {
  const text = eventText(event);

  if (FLIGHT_PATTERNS.some((pattern) => pattern.test(text))) {
    return "travel-flight";
  }

  if (HOTEL_PATTERNS.some((pattern) => pattern.test(text))) {
    return "travel-hotel";
  }

  if (CONFERENCE_PATTERNS.some((pattern) => pattern.test(text))) {
    return "conference";
  }

  const multiDay = event.isAllDay || eventDurationHours(event) >= 6;
  if (
    multiDay &&
    event.location?.trim() &&
    !isVirtualLocation(event.location)
  ) {
    return "conference";
  }

  if (
    /\b(?:travel|airport|rental car|lyft|uber|train|amtrak)\b/i.test(text)
  ) {
    return "travel-other";
  }

  return "meeting";
}

export function conferenceRequiresTravel(event: CalendarClusterInput): boolean {
  const kind = classifyCalendarEventKind(event);
  if (kind !== "conference") return false;
  if (isVirtualLocation(event.location)) return false;
  return true;
}

function travelInConferenceWindow(
  conference: CalendarClusterInput,
  travel: CalendarClusterInput
): boolean {
  const windowStart = new Date(conference.start);
  windowStart.setDate(windowStart.getDate() - 4);
  const windowEnd = eventEnd(conference);
  windowEnd.setDate(windowEnd.getDate() + 1);

  return travel.start >= windowStart && travel.start <= windowEnd;
}

function isTravelKind(kind: CalendarEventKind): boolean {
  return (
    kind === "travel-flight" ||
    kind === "travel-hotel" ||
    kind === "travel-other"
  );
}

export function clusterCalendarEvents(
  events: CalendarClusterInput[],
  now = new Date()
): CalendarClusterGroup[] {
  const classified = events.map((event) => ({
    event,
    kind: classifyCalendarEventKind(event),
  }));

  const conferences = classified.filter(({ kind }) => kind === "conference");
  const travel = classified.filter(({ kind }) => isTravelKind(kind));

  const groups: CalendarClusterGroup[] = [];
  const assignedChildIds = new Set<string>();

  for (const { event: parent, kind } of conferences) {
    const destinationHint = extractDestinationHint(
      eventText(parent),
      parent.location
    );
    const clusterId = `cluster-${parent.id}`;
    const children: CalendarClusterInput[] = [];

    for (const { event: child, kind: childKind } of travel) {
      if (assignedChildIds.has(child.id)) continue;
      if (!travelInConferenceWindow(parent, child)) continue;

      const childDestination = extractDestinationHint(
        eventText(child),
        child.location
      );
      if (!destinationsMatch(destinationHint, childDestination)) continue;

      children.push(child);
      assignedChildIds.add(child.id);
    }

    const hasFlight = children.some(
      (child) => classifyCalendarEventKind(child) === "travel-flight"
    );
    const hasHotel = children.some(
      (child) => classifyCalendarEventKind(child) === "travel-hotel"
    );
    const requiresTravel = conferenceRequiresTravel(parent);
    const missingTravel =
      requiresTravel &&
      daysUntilEvent(parent.start, now) >= 0 &&
      (!hasFlight || !hasHotel);

    groups.push({
      clusterId,
      parent,
      children,
      missingTravel,
      destinationHint,
    });
  }

  return groups;
}

export function buildClusterAssignments(
  events: CalendarClusterInput[],
  now = new Date()
): Map<string, CalendarClusterAssignment> {
  const assignments = new Map<string, CalendarClusterAssignment>();
  const groups = clusterCalendarEvents(events, now);

  for (const event of events) {
    const eventKind = classifyCalendarEventKind(event);
    assignments.set(event.id, {
      eventKind,
      clusterId: null,
      parentEventId: null,
      destinationHint: extractDestinationHint(eventText(event), event.location),
      missingTravel: false,
      linkedTravelIds: [],
    });
  }

  for (const group of groups) {
    const parentAssignment = assignments.get(group.parent.id);
    if (!parentAssignment) continue;

    parentAssignment.clusterId = group.clusterId;
    parentAssignment.destinationHint = group.destinationHint;
    parentAssignment.missingTravel = group.missingTravel;
    parentAssignment.linkedTravelIds = group.children.map((child) => child.id);

    for (const child of group.children) {
      const childAssignment = assignments.get(child.id);
      if (!childAssignment) continue;
      childAssignment.clusterId = group.clusterId;
      childAssignment.parentEventId = group.parent.id;
      childAssignment.destinationHint = group.destinationHint;
    }
  }

  return assignments;
}

export function missingTravelNextStepTitle(parentSubject: string): string {
  const trimmed = parentSubject.trim() || "upcoming event";
  return `Book travel for ${trimmed}`;
}

export function travelLogisticsLabel(kind: CalendarEventKind): string {
  switch (kind) {
    case "travel-flight":
      return "Flight";
    case "travel-hotel":
      return "Hotel";
    case "travel-other":
      return "Travel";
    default:
      return "Logistics";
  }
}
