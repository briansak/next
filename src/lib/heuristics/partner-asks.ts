import type { CommunicationSource, Priority } from "@prisma/client";
import { getViewerOverride } from "../communications/viewer-override";
import {
  isPartnerSenderAddress,
  subjectMatchesPartnerPrefix,
  type PartnerCoverageConfig,
} from "../integrations/email/partner-rules";
import {
  filterSubstantiveQuestions,
  isAutomatedNotificationText,
  isBoilerplateQuestion,
} from "./boilerplate-questions";

const ASK_SENTENCE_RE =
  /\b(?:can you|could you|would you|please (?:review|send|confirm|provide|update|share|let us know)|need (?:you|your|this|a)|waiting (?:on|for)|action required|when (?:can|will|is)|do we have|(?:wondering|curious) if you|if you (?:have|had) anything|anything you could share)\b/i;

export interface PartnerAskItem {
  communicationId: string;
  subject: string | null;
  ask: string;
  source: CommunicationSource;
  priority: Priority;
  receivedAt: Date;
  authorName: string | null;
}

interface AskCandidate {
  id: string;
  subject: string | null;
  body: string;
  excerpt: string | null;
  summary: string | null;
  source: CommunicationSource;
  priority: Priority;
  receivedAt: Date;
  authorName: string | null;
  tags: string[];
  metadata: unknown;
}

function metadataQuestionSnippets(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const snippets = (metadata as { questionSnippets?: unknown }).questionSnippets;
  if (!Array.isArray(snippets)) return [];
  return filterSubstantiveQuestions(
    snippets.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
  );
}

function sentenceWithAsk(text: string): string | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const sentences = normalized.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (
      trimmed.length >= 20 &&
      ASK_SENTENCE_RE.test(trimmed) &&
      !isBoilerplateQuestion(trimmed)
    ) {
      return trimmed.slice(0, 280);
    }
  }

  if (ASK_SENTENCE_RE.test(normalized) && !isBoilerplateQuestion(normalized)) {
    return normalized.slice(0, 280);
  }

  return null;
}

export function extractPartnerAskText(candidate: AskCandidate): string | null {
  const fromMeta = metadataQuestionSnippets(candidate.metadata);
  if (fromMeta[0]) return fromMeta[0].trim();

  const fromBody = sentenceWithAsk(candidate.body);
  if (fromBody) return fromBody;

  if (
    candidate.excerpt &&
    ASK_SENTENCE_RE.test(candidate.excerpt) &&
    !isBoilerplateQuestion(candidate.excerpt)
  ) {
    return candidate.excerpt.trim().slice(0, 280);
  }

  if (
    candidate.summary &&
    ASK_SENTENCE_RE.test(candidate.summary) &&
    !isBoilerplateQuestion(candidate.summary)
  ) {
    return candidate.summary.trim().slice(0, 280);
  }

  return null;
}

function partnerFromAddress(metadata: unknown): string {
  return (
    (metadata as { fromAddress?: string | null })?.fromAddress?.toLowerCase() ??
    ""
  );
}

function isPartnerSender(
  metadata: unknown,
  coverage?: PartnerCoverageConfig
): boolean {
  if (!coverage) return false;
  return isPartnerSenderAddress(partnerFromAddress(metadata), coverage);
}

function hasPartnerAskScope(
  candidate: AskCandidate,
  coverage?: PartnerCoverageConfig
): boolean {
  if (
    candidate.tags.includes("partner-coverage") ||
    candidate.tags.includes("partner-meeting")
  ) {
    return true;
  }

  if (
    coverage &&
    subjectMatchesPartnerPrefix(candidate.subject, coverage) &&
    (candidate.tags.includes("directed-question") ||
      candidate.tags.includes("has-question"))
  ) {
    return true;
  }

  if (candidate.tags.includes("mentioned-you") && isPartnerSender(candidate.metadata, coverage)) {
    return true;
  }

  // Partner email directed to you (To/Cc) even when allowlist tag was missed on ingest.
  if (
    candidate.source === "EMAIL" &&
    candidate.tags.includes("directed-question") &&
    isPartnerSender(candidate.metadata, coverage)
  ) {
    return true;
  }

  return false;
}

/** Whether the message contains an ask directed at the viewer or team. */
export function hasPartnerAskActionSignal(candidate: AskCandidate): boolean {
  if (candidate.tags.includes("action-required")) return true;

  // Email questions to you from a partner (e.g. "What availability do you have?")
  // may not match explicit "can you" patterns but still warrant a response.
  if (
    candidate.source === "EMAIL" &&
    candidate.tags.includes("has-question") &&
    candidate.tags.includes("directed-question") &&
    !candidate.tags.includes("mailer")
  ) {
    return true;
  }

  return false;
}

function isAutomatedPartnerNotification(candidate: AskCandidate): boolean {
  const text = [candidate.subject, candidate.body, candidate.excerpt, candidate.summary]
    .filter(Boolean)
    .join("\n");
  return isAutomatedNotificationText(text);
}

export function isPartnerAskCandidate(
  candidate: AskCandidate,
  partnerCoverage?: PartnerCoverageConfig
): boolean {
  if (candidate.tags.includes("noise")) return false;
  if (candidate.source === "WEBEX_MEETING") return false;
  if (isAutomatedPartnerNotification(candidate)) return false;
  if (!hasPartnerAskActionSignal(candidate)) return false;
  if (!hasPartnerAskScope(candidate, partnerCoverage)) return false;
  const ask = extractPartnerAskText(candidate);
  if (!ask || isBoilerplateQuestion(ask)) return false;
  return true;
}

function isHiddenForViewer(
  candidate: AskCandidate,
  userId?: string,
  hiddenCommunicationIds?: string[]
): boolean {
  if (hiddenCommunicationIds?.includes(candidate.id)) return true;
  if (!userId) return false;
  return getViewerOverride(candidate.metadata, userId)?.hidden === true;
}

export interface PartnerAskCollectionOptions {
  limit?: number;
  userId?: string;
  hiddenCommunicationIds?: string[];
  partnerCoverage?: PartnerCoverageConfig;
}

export function collectPartnerAsks(
  items: AskCandidate[],
  options?: number | PartnerAskCollectionOptions
): PartnerAskItem[] {
  const limit = typeof options === "number" ? options : (options?.limit ?? 8);
  const userId = typeof options === "number" ? undefined : options?.userId;
  const hiddenCommunicationIds =
    typeof options === "number" ? undefined : options?.hiddenCommunicationIds;
  const partnerCoverage =
    typeof options === "number" ? undefined : options?.partnerCoverage;
  const asks: PartnerAskItem[] = [];

  for (const item of items) {
    if (isHiddenForViewer(item, userId, hiddenCommunicationIds)) continue;
    if (!isPartnerAskCandidate(item, partnerCoverage)) continue;
    const ask = extractPartnerAskText(item);
    if (!ask) continue;

    asks.push({
      communicationId: item.id,
      subject: item.subject,
      ask,
      source: item.source,
      priority: item.priority,
      receivedAt: item.receivedAt,
      authorName: item.authorName,
    });
  }

  return asks
    .sort(
      (a, b) =>
        b.receivedAt.getTime() - a.receivedAt.getTime()
    )
    .slice(0, limit);
}
