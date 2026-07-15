export interface EventPrepSuggestionInput {
  subject: string;
  location?: string;
  tags?: string[];
  daysUntil?: number;
}

function truncateSubject(subject: string, max = 48): string {
  const trimmed = subject.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function suggestEventPrepTodos(
  input: EventPrepSuggestionInput
): string[] {
  const subject = input.subject.trim();
  const text = [subject, input.location].filter(Boolean).join(" ");
  const suggestions: string[] = [];
  const shortTitle = truncateSubject(subject);

  if (/\b(present|presentation|demo|qbr|brief|deck|slides|pitch)\b/i.test(text)) {
    suggestions.push(`Build presentation content for ${shortTitle}`);
  }

  if (
    /\b(onsite|on-site|visit|travel|offsite|off-site|customer site)\b/i.test(
      text
    ) ||
    (input.location?.trim() &&
      !/teams|zoom|webex|meet\.google|virtual|remote|phone/i.test(
        input.location
      ))
  ) {
    suggestions.push(`Book travel for ${shortTitle}`);
    suggestions.push("Confirm onsite logistics and venue");
  }

  if (input.tags?.includes("partner-meeting")) {
    suggestions.push("Align agenda with partner attendees");
  }

  if (input.tags?.includes("coordination")) {
    suggestions.push("Confirm attendee availability and roles");
  }

  if (
    input.tags?.includes("big-rock") ||
    /\b(workshop|kickoff|kick-off|strategy|executive)\b/i.test(text)
  ) {
    suggestions.push(`Prepare agenda and materials for ${shortTitle}`);
  }

  if (input.tags?.includes("needs-prep")) {
    suggestions.push(`Block prep time before ${shortTitle}`);
  }

  if (suggestions.length === 0) {
    suggestions.push(`Review prep checklist for ${shortTitle}`);
    suggestions.push(`Plan follow-ups after ${shortTitle}`);
  }

  return [...new Set(suggestions)].slice(0, 4);
}

export function defaultPrepDueDate(eventStart: Date): Date {
  const due = new Date(eventStart);
  due.setDate(due.getDate() - 2);
  due.setHours(17, 0, 0, 0);
  if (due.getTime() < Date.now()) {
    return new Date(Date.now() + 24 * 60 * 60 * 1000);
  }
  return due;
}
