import { createHash } from "crypto";

export interface CalendarEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end?: Date;
  organizerEmail?: string;
  organizerName?: string;
  attendeeEmails: string[];
  isRecurring?: boolean;
  isAllDay?: boolean;
}

export function parseIcs(raw: string): CalendarEvent[] {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const unfolded = normalized
    .split("\n")
    .reduce<string[]>((lines, line) => {
      if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
        lines[lines.length - 1] += line.slice(1);
      } else {
        lines.push(line);
      }
      return lines;
    }, [])
    .join("\n");

  const blocks = unfolded.split("BEGIN:VEVENT");
  const events: CalendarEvent[] = [];

  for (const block of blocks.slice(1)) {
    const eventBlock = block.split("END:VEVENT")[0] ?? "";
    const fields = parseIcsFields(eventBlock);
    const uid = fields.get("UID");
    const summary = fields.get("SUMMARY");
    const start = parseIcsDate(fields.get("DTSTART"));
    if (!uid || !summary || !start) continue;

    const organizer = parseOrganizer(fields.get("ORGANIZER"));
    const attendees = parseAttendees(eventBlock);
    const isRecurring = isRecurringIcsEvent(eventBlock, fields);

    events.push({
      uid: uid.replace(/^<|>$/g, ""),
      summary: decodeIcsText(summary),
      description: fields.get("DESCRIPTION")
        ? decodeIcsText(fields.get("DESCRIPTION")!)
        : undefined,
      location: fields.get("LOCATION")
        ? decodeIcsText(fields.get("LOCATION")!)
        : undefined,
      start,
      end: fields.get("DTEND")
        ? (parseIcsDate(fields.get("DTEND")!) ?? undefined)
        : undefined,
      organizerEmail: organizer.email,
      organizerName: organizer.name,
      attendeeEmails: attendees,
      isRecurring,
      isAllDay: fields.get("DTSTART")?.trim().length === 8,
    });
  }

  return events;
}

function parseIcsFields(block: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of block.split("\n")) {
    if (!line.trim()) continue;
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const rawKey = line.slice(0, colon);
    const key = rawKey.split(";")[0]?.toUpperCase() ?? rawKey;
    const value = line.slice(colon + 1);
    if (!fields.has(key)) fields.set(key, value);
  }
  return fields;
}

function parseIcsDate(value: string | undefined): Date | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (/^\d{8}T\d{6}Z?$/i.test(trimmed)) {
    const y = trimmed.slice(0, 4);
    const m = trimmed.slice(4, 6);
    const d = trimmed.slice(6, 8);
    const hh = trimmed.slice(9, 11);
    const mm = trimmed.slice(11, 13);
    const ss = trimmed.slice(13, 15);
    const parsed = new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (/^\d{8}$/.test(trimmed)) {
    const y = trimmed.slice(0, 4);
    const m = trimmed.slice(4, 6);
    const d = trimmed.slice(6, 8);
    const parsed = new Date(`${y}-${m}-${d}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseOrganizer(value: string | undefined): {
  email?: string;
  name?: string;
} {
  if (!value) return {};
  const mailto = value.match(/mailto:([^;]+)/i);
  const cn = value.match(/CN=([^;:]+)/i);
  return {
    email: mailto?.[1]?.toLowerCase(),
    name: cn?.[1]?.trim(),
  };
}

/** Master events with RRULE or recurrence instances are treated as recurring. */
function isRecurringIcsEvent(
  eventBlock: string,
  fields: Map<string, string>
): boolean {
  if (fields.has("RECURRENCE-ID")) return true;
  if (fields.has("RRULE")) return true;
  return /^RRULE:/im.test(eventBlock);
}

function parseAttendees(block: string): string[] {
  const emails: string[] = [];
  for (const line of block.split("\n")) {
    if (!line.toUpperCase().startsWith("ATTENDEE")) continue;
    const mailto = line.match(/mailto:([^;:\s]+)/i);
    if (mailto?.[1]) emails.push(mailto[1].toLowerCase());
  }
  return [...new Set(emails)];
}

function decodeIcsText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

export function calendarEventId(uid: string, start: Date): string {
  return createHash("sha256")
    .update(`${uid}|${start.toISOString()}`)
    .digest("hex")
    .slice(0, 40);
}
