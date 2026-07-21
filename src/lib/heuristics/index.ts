import type { Priority } from "@prisma/client";
import type { EmailAllowlistRule } from "../integrations/email/allowlist";
import { scoreEmailPartnerPriority } from "../integrations/email/allowlist";
import { normalizeEmailBodyText } from "../integrations/email/body-text";
import {
  digestSummaryPreview,
  distillEmailDigest,
} from "./email-digest-summary";
import {
  detectMentions,
  type MentionUser,
  MENTION_PRIORITY_BOOST,
  viewerMentionedInText,
} from "./mentions";
import { analyzeEmailAudience } from "./email-questions";

export type { MentionUser, MentionMatch } from "./mentions";
export {
  buildMentionAliases,
  detectMentions,
  viewerIsMentioned,
  viewerMentionedInText,
  MENTION_PRIORITY_BOOST,
} from "./mentions";

export interface HeuristicInput {
  body: string;
  subject?: string | null;
  authorName?: string | null;
  receivedAt: Date;
  threadReplyCount?: number;
  daysSinceLastTeamReply?: number;
  /** Team members to check for @mentions in the message */
  teamMembers?: MentionUser[];
  /** Logged-in user — boosts priority when they are @mentioned */
  viewer?: MentionUser;
  /** Email audience fields for directed-question detection */
  fromAddress?: string;
  toAddresses?: string[];
  ccAddresses?: string[];
  listId?: string;
  precedence?: string;
  listUnsubscribe?: string;
  autoSubmitted?: string;
  /** Partner coverage rules — boost priority when matched, never used to drop messages */
  partnerAllowlistRules?: EmailAllowlistRule[];
}

export interface HeuristicResult {
  priority: Priority;
  priorityScore: number;
  priorityReasons: string[];
  summary: string;
  suggestedAction?: string;
  extractedDeadline?: Date;
  tags: string[];
  mentionedUserIds: string[];
  viewerMentioned: boolean;
  directedRecipientUserIds: string[];
  hasQuestion: boolean;
  isMailer: boolean;
  questionSnippets: string[];
}

const ASK_PATTERNS = [
  /\bcan you\b/i,
  /\bcould you\b/i,
  /\bplease (review|send|confirm|provide|update|let us know|share)\b/i,
  /\bneed (you|your|this|a)\b/i,
  /\bwaiting (on|for)\b/i,
  /\baction required\b/i,
  /\b(?:wondering|curious) if you\b/i,
  /\bif you (?:have|had) anything\b/i,
  /\banything you could share\b/i,
];

const DEADLINE_PATTERNS = [
  /\bASAP\b/i,
  /\bEOD\b/i,
  /\bend of day\b/i,
  /\burgent\b/i,
  /\bby (monday|tuesday|wednesday|thursday|friday|tomorrow)\b/i,
  /\bdue\b/i,
  /\bdeadline\b/i,
  /\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/,
];

const NOISE_PATTERNS = [
  /\bFYI\b/i,
  /\bout of office\b/i,
  /\bautomatic reply\b/i,
  /\bdo not reply\b/i,
  /\bunsubscribe\b/i,
  /\bnewsletter\b/i,
];

const PRIORITY_THRESHOLDS: { min: number; priority: Priority }[] = [
  { min: 8, priority: "CRITICAL" },
  { min: 6, priority: "HIGH" },
  { min: 4, priority: "MEDIUM" },
  { min: 2, priority: "LOW" },
  { min: 0, priority: "INFO" },
];

export function scoreToPriority(score: number): Priority {
  return PRIORITY_THRESHOLDS.find((t) => score >= t.min)?.priority ?? "INFO";
}

export function analyzeCommunication(input: HeuristicInput): HeuristicResult {
  const text = [input.subject, input.body].filter(Boolean).join(" ");
  const reasons: string[] = [];
  let score = 0;
  const tags: string[] = [];

  const mentionMatches = input.teamMembers?.length
    ? detectMentions(text, input.teamMembers)
    : [];
  const mentionedUserIds = mentionMatches.map((m) => m.userId);
  const viewerMentioned = input.viewer
    ? mentionedUserIds.includes(input.viewer.id)
    : false;

  if (mentionMatches.length > 0) {
    tags.push("mention");
    const names = mentionMatches.map((m) => `@${m.alias}`).join(", ");
    reasons.push(`Mentions team member(s): ${names}`);
    score += 2;
  }

  if (viewerMentioned) {
    tags.push("mentioned-you");
    const alias = mentionMatches.find((m) => m.userId === input.viewer?.id)?.alias;
    reasons.push(`Mentions you${alias ? ` (@${alias})` : ""}`);
    score += MENTION_PRIORITY_BOOST;
  }

  if (ASK_PATTERNS.some((p) => p.test(text))) {
    score += 3;
    reasons.push("Contains explicit ask");
    tags.push("action-required");
  }

  if (DEADLINE_PATTERNS.some((p) => p.test(text))) {
    score += 3;
    reasons.push("Mentions deadline or urgency");
    tags.push("deadline");
  }

  if (input.daysSinceLastTeamReply !== undefined && input.daysSinceLastTeamReply >= 3) {
    score += 2;
    reasons.push(`No team reply in ${input.daysSinceLastTeamReply} days`);
    tags.push("unanswered");
  }

  if (NOISE_PATTERNS.some((p) => p.test(text))) {
    score -= 2;
    reasons.push("Likely informational/noise");
    tags.push("noise");
  }

  const audience = analyzeEmailAudience({
    subject: input.subject,
    body: input.body,
    fromAddress: input.fromAddress,
    toAddresses: input.toAddresses,
    ccAddresses: input.ccAddresses,
    listId: input.listId,
    precedence: input.precedence,
    listUnsubscribe: input.listUnsubscribe,
    autoSubmitted: input.autoSubmitted,
    teamMembers: input.teamMembers,
  });

  if (audience.tags.length > 0) {
    tags.push(...audience.tags);
    reasons.push(...audience.reasons);
    score += audience.scoreBoost;
  }

  if (input.partnerAllowlistRules?.length && input.fromAddress) {
    const partner = scoreEmailPartnerPriority(
      { fromAddress: input.fromAddress, subject: input.subject ?? "" },
      input.partnerAllowlistRules
    );
    if (partner.matched) {
      score += partner.scoreBoost;
      reasons.push(...partner.reasons);
      tags.push(...partner.tags);
    }
  }

  score = Math.max(0, Math.min(10, score));

  const priority = scoreToPriority(score);

  const summary = buildSummary(input, tags);
  const suggestedAction =
    audience.suggestedAction ??
    extractSuggestedAction(text, tags, viewerMentioned);

  return {
    priority,
    priorityScore: score,
    priorityReasons: reasons,
    summary,
    suggestedAction,
    tags,
    mentionedUserIds,
    viewerMentioned,
    directedRecipientUserIds: audience.directedRecipientUserIds,
    hasQuestion: audience.hasQuestion,
    isMailer: audience.isMailer,
    questionSnippets: audience.questionSnippets,
  };
}

/** Re-score for dashboard display when viewer wasn't known at ingest time. */
export function applyViewerMentionBoost(
  baseScore: number,
  mentionedUserIds: string[] | undefined,
  viewerId: string,
  options?: { text?: string | null; viewer?: MentionUser }
): { score: number; priority: Priority; mentionedYou: boolean } {
  const mentionedYou =
    (mentionedUserIds?.includes(viewerId) ?? false) ||
    (options?.text && options.viewer?.id === viewerId
      ? viewerMentionedInText(options.text, options.viewer)
      : false);
  const score = Math.min(10, baseScore + (mentionedYou ? MENTION_PRIORITY_BOOST : 0));
  return { score, priority: scoreToPriority(score), mentionedYou };
}

function buildSummary(input: HeuristicInput, tags: string[]): string {
  const body = normalizeEmailBodyText(input.body ?? "");
  const subject = input.subject ?? "";
  const tagNote = tags.length > 0 ? ` [${tags.join(", ")}]` : "";

  const digest = distillEmailDigest(subject, body);
  if (digest) {
    return `${digestSummaryPreview(digest)}${tagNote}`;
  }

  const excerpt = body.slice(0, 200).trim();
  const prefix = subject ? `${subject}: ` : "";
  return `${prefix}${excerpt}${body.length > 200 ? "…" : ""}${tagNote}`;
}

function extractSuggestedAction(
  text: string,
  tags: string[],
  viewerMentioned: boolean
): string | undefined {
  if (tags.includes("directed-question")) {
    return "Answer the question in this email";
  }
  if (viewerMentioned || tags.includes("mentioned-you")) {
    return "Respond — you were @mentioned";
  }
  if (tags.includes("mention")) {
    return "Review — team member was @mentioned";
  }
  if (tags.includes("action-required")) {
    return "Review and respond to the request";
  }
  if (tags.includes("deadline")) {
    return "Check deadline and assign owner";
  }
  if (tags.includes("unanswered")) {
    return "Follow up on unanswered thread";
  }
  if (/\breview\b/i.test(text)) {
    return "Review attached content or proposal";
  }
  return undefined;
}
