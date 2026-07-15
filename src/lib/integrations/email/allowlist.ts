/**
 * Email allowlist matching — shared across Microsoft 365 and other email sources.
 */

export interface EmailMessage {
  messageId: string;
  subject: string;
  body: string;
  fromAddress: string;
  fromName?: string;
  receivedAt: Date;
  threadId?: string;
  toAddresses?: string[];
  ccAddresses?: string[];
  listId?: string;
  precedence?: string;
  listUnsubscribe?: string;
  autoSubmitted?: string;
}

export interface EmailAllowlistRule {
  fromAddress?: string | null;
  fromDomain?: string | null;
  subjectPrefix?: string | null;
}

/**
 * Returns true only if the message matches at least one allowlist rule.
 * If no rules are configured, nothing is ingested.
 */
export function matchesEmailAllowlist(
  message: Pick<EmailMessage, "fromAddress" | "subject">,
  rules: EmailAllowlistRule[]
): boolean {
  if (rules.length === 0) {
    return false;
  }

  const fromLower = message.fromAddress.toLowerCase();
  const domain = fromLower.split("@")[1] ?? "";

  return rules.some((rule) => {
    if (rule.fromAddress && fromLower === rule.fromAddress.toLowerCase()) {
      return true;
    }
    if (rule.fromDomain && domain === rule.fromDomain.toLowerCase()) {
      return true;
    }
    if (
      rule.subjectPrefix &&
      message.subject.startsWith(rule.subjectPrefix)
    ) {
      return true;
    }
    return false;
  });
}

/** Calendar events use organizer email + event title against the same allowlist. */
export function matchesCalendarAllowlist(
  event: {
    summary: string;
    organizerEmail?: string;
  },
  rules: EmailAllowlistRule[]
): boolean {
  if (rules.length === 0) return false;

  const organizer = event.organizerEmail?.toLowerCase() ?? "";
  const domain = organizer.split("@")[1] ?? "";

  return rules.some((rule) => {
    if (rule.fromAddress && organizer === rule.fromAddress.toLowerCase()) {
      return true;
    }
    if (rule.fromDomain && domain === rule.fromDomain.toLowerCase()) {
      return true;
    }
    if (rule.subjectPrefix && event.summary.startsWith(rule.subjectPrefix)) {
      return true;
    }
    return false;
  });
}
