/**
 * Partner coverage rules — used to boost priority for partner-related correspondence,
 * not to filter what gets ingested.
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

export interface PartnerPriorityMatch {
  matched: boolean;
  scoreBoost: number;
  reasons: string[];
  tags: string[];
}

/**
 * Returns true when the message matches a partner coverage rule.
 * Used for prioritization — not as an ingestion gate.
 */
export function matchesEmailAllowlist(
  message: Pick<EmailMessage, "fromAddress" | "subject">,
  rules: EmailAllowlistRule[]
): boolean {
  return scoreEmailPartnerPriority(message, rules).matched;
}

export function scoreEmailPartnerPriority(
  message: Pick<EmailMessage, "fromAddress" | "subject">,
  rules: EmailAllowlistRule[]
): PartnerPriorityMatch {
  if (rules.length === 0) {
    return { matched: false, scoreBoost: 0, reasons: [], tags: [] };
  }

  const fromLower = message.fromAddress.toLowerCase();
  const domain = fromLower.split("@")[1] ?? "";
  const reasons: string[] = [];
  let scoreBoost = 0;

  for (const rule of rules) {
    if (rule.fromAddress && fromLower === rule.fromAddress.toLowerCase()) {
      scoreBoost = Math.max(scoreBoost, 3);
      reasons.push(`From partner contact ${rule.fromAddress}`);
    }
    if (rule.fromDomain && domain === rule.fromDomain.toLowerCase()) {
      scoreBoost = Math.max(scoreBoost, 2);
      reasons.push(`From partner domain @${rule.fromDomain}`);
    }
    if (rule.subjectPrefix && message.subject.startsWith(rule.subjectPrefix)) {
      scoreBoost = Math.max(scoreBoost, 2);
      reasons.push(`Partner thread prefix "${rule.subjectPrefix}"`);
    }
  }

  return {
    matched: scoreBoost > 0,
    scoreBoost,
    reasons: [...new Set(reasons)],
    tags: scoreBoost > 0 ? ["partner-coverage"] : [],
  };
}

export function scoreCalendarPartnerPriority(
  event: {
    summary: string;
    organizerEmail?: string;
  },
  rules: EmailAllowlistRule[]
): PartnerPriorityMatch {
  return scoreEmailPartnerPriority(
    {
      fromAddress: event.organizerEmail ?? "",
      subject: event.summary,
    },
    rules
  );
}

/** @deprecated Use scoreCalendarPartnerPriority — calendar events are no longer filtered by rules. */
export function matchesCalendarAllowlist(
  event: {
    summary: string;
    organizerEmail?: string;
  },
  rules: EmailAllowlistRule[]
): boolean {
  return scoreCalendarPartnerPriority(event, rules).matched;
}
