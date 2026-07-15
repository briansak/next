import type { Priority } from "@prisma/client";
import { scoreToPriority } from "./index";
import type { MentionUser } from "./mentions";
import { viewerInRecipients as recipientMatch } from "../integrations/email/recipients";

export { viewerInRecipients } from "../integrations/email/recipients";

export const DIRECTED_QUESTION_BOOST = 3;

export interface EmailAudienceInput {
  subject?: string | null;
  body: string;
  fromAddress?: string;
  toAddresses?: string[];
  ccAddresses?: string[];
  listId?: string;
  precedence?: string;
  listUnsubscribe?: string;
  autoSubmitted?: string;
  teamMembers?: MentionUser[];
}

export interface EmailAudienceResult {
  hasQuestion: boolean;
  questionSnippets: string[];
  isMailer: boolean;
  directedRecipientUserIds: string[];
  tags: string[];
  reasons: string[];
  scoreBoost: number;
  suggestedAction?: string;
}

const IMPLICIT_QUESTION_PATTERNS = [
  /\b(?:what|when|where|who|how|why|which)\b[^.!?\n]{4,140}\?/i,
  /\b(?:can|could|would|will|do|does|did|is|are|should)\s+you\b[^.!?\n]{3,140}\?/i,
  /\b(?:can|could|would|do|does)\s+(?:we|anyone|someone|anybody)\b[^.!?\n]{3,140}\?/i,
];

const MAILER_FROM_PATTERNS = [
  /(?:^|[^a-z0-9])no[-_.]?reply@/i,
  /donotreply@/i,
  /mailer-daemon@/i,
  /bounce@/i,
  /notifications?@/i,
  /newsletter@/i,
  /updates?@/i,
];

export function stripUrls(text: string): string {
  return text.replace(/https?:\/\/\S+/gi, " ");
}

export function detectQuestions(text: string): {
  hasQuestion: boolean;
  snippets: string[];
} {
  const withoutQuotes = text
    .split("\n")
    .filter((line) => !line.trim().startsWith(">"))
    .join("\n");
  const cleaned = stripUrls(withoutQuotes).replace(/\s+/g, " ").trim();
  if (!cleaned) return { hasQuestion: false, snippets: [] };

  const snippets: string[] = [];
  const seen = new Set<string>();

  const candidates = [
    ...cleaned.split(/(?<=[.!?])\s+/),
    ...cleaned.split(/\n+/),
  ];

  for (const raw of candidates) {
    const sentence = raw.trim();
    if (sentence.length < 8) continue;

    const hasMark = sentence.includes("?");
    const implicit = IMPLICIT_QUESTION_PATTERNS.some((pattern) =>
      pattern.test(sentence)
    );
    if (!hasMark && !implicit) continue;

    const key = sentence.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    snippets.push(sentence.slice(0, 220));
  }

  return { hasQuestion: snippets.length > 0, snippets: snippets.slice(0, 4) };
}

export function isMailerEmail(input: {
  fromAddress?: string;
  toAddresses?: string[];
  ccAddresses?: string[];
  listId?: string;
  precedence?: string;
  listUnsubscribe?: string;
  autoSubmitted?: string;
  subject?: string | null;
  body?: string;
}): boolean {
  if (input.listId?.trim()) return true;
  if (input.listUnsubscribe?.trim()) return true;
  if (input.precedence && /^(?:bulk|list|junk)$/i.test(input.precedence.trim())) {
    return true;
  }
  if (
    input.autoSubmitted?.trim() &&
    !/^no$/i.test(input.autoSubmitted.trim())
  ) {
    return true;
  }

  const from = (input.fromAddress ?? "").toLowerCase();
  if (MAILER_FROM_PATTERNS.some((pattern) => pattern.test(from))) {
    return true;
  }

  const recipientCount =
    (input.toAddresses?.length ?? 0) + (input.ccAddresses?.length ?? 0);
  const text = `${input.subject ?? ""}\n${input.body ?? ""}`;
  if (recipientCount >= 8 && /\bunsubscribe\b/i.test(text)) {
    return true;
  }

  return false;
}

export function directedRecipientUserIds(
  teamMembers: MentionUser[] | undefined,
  toAddresses: string[] = [],
  ccAddresses: string[] = []
): string[] {
  if (!teamMembers?.length) return [];

  const recipients = new Set(
    [...toAddresses, ...ccAddresses].map((address) => address.toLowerCase())
  );

  return teamMembers
    .filter((member) => recipients.has(member.email.toLowerCase()))
    .map((member) => member.id);
}

export function analyzeEmailAudience(
  input: EmailAudienceInput
): EmailAudienceResult {
  const text = [input.subject, input.body].filter(Boolean).join("\n");
  const question = detectQuestions(text);
  const isMailer = isMailerEmail(input);
  const recipientUserIds = directedRecipientUserIds(
    input.teamMembers,
    input.toAddresses,
    input.ccAddresses
  );

  const tags: string[] = [];
  const reasons: string[] = [];
  let scoreBoost = 0;
  let suggestedAction: string | undefined;

  if (question.hasQuestion) {
    tags.push("has-question");
    reasons.push("Contains a question");
    scoreBoost += 1;
  }

  if (
    question.hasQuestion &&
    !isMailer &&
    recipientUserIds.length > 0
  ) {
    tags.push("directed-question");
    reasons.push("Question directed to you (To/Cc)");
    scoreBoost += DIRECTED_QUESTION_BOOST;
    suggestedAction = "Answer the question in this email";
  }

  if (isMailer) {
    tags.push("mailer");
  }

  return {
    hasQuestion: question.hasQuestion,
    questionSnippets: question.snippets,
    isMailer,
    directedRecipientUserIds: recipientUserIds,
    tags,
    reasons,
    scoreBoost,
    suggestedAction,
  };
}

export function applyViewerDirectedQuestionBoost(
  baseScore: number,
  metadata: {
    hasQuestion?: boolean;
    isMailer?: boolean;
    toAddresses?: string[];
    ccAddresses?: string[];
    directedRecipientUserIds?: string[];
  },
  viewer: { userId: string; email: string },
  alreadyTaggedDirected = false
): { score: number; priority: Priority; directedQuestion: boolean } {
  const inRecipients =
    metadata.directedRecipientUserIds?.includes(viewer.userId) ||
    (metadata.hasQuestion &&
      !metadata.isMailer &&
      recipientMatch(
        viewer.email,
        metadata.toAddresses,
        metadata.ccAddresses
      ));

  const directedQuestion = Boolean(
    metadata.hasQuestion && !metadata.isMailer && inRecipients
  );

  const score = Math.min(
    10,
    directedQuestion && !alreadyTaggedDirected
      ? baseScore + DIRECTED_QUESTION_BOOST
      : baseScore
  );

  return {
    score,
    priority: scoreToPriority(score),
    directedQuestion,
  };
}
