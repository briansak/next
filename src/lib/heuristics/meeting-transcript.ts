import {
  detectSpokenReferences,
  type MentionUser,
  MENTION_PRIORITY_BOOST,
} from "./mentions";

export interface TranscriptActionItem {
  title: string;
  excerpt: string;
  assigneeUserIds: string[];
  assigneeAliases: string[];
  mentionsViewer: boolean;
}

export interface MeetingTranscriptAnalysis {
  actionItems: TranscriptActionItem[];
  mentionedUserIds: string[];
  viewerMentioned: boolean;
  viewerHasAssignedAction: boolean;
  priorityBoost: number;
  priorityReasons: string[];
  tags: string[];
}

const TRANSCRIPT_ACTION_PATTERNS = [
  /\b(action items?|next steps?|follow[- ]?ups?|to[- ]?dos?)\b/i,
  /\b(we need to|I'll need you to|I need you to|need you to|you need to|you'll need to)\b/i,
  /\b(can you|could you|would you|will you|please)\b/i,
  /\b(assign(?:ed)? to|take ownership|responsible for|your action)\b/i,
  /\b(send|review|schedule|prepare|update|confirm|deliver|complete|finish|share|provide)\b.{0,60}\b(by|before|this week|next week)\b/i,
  /\b(let's|let us)\b.{0,60}\b(schedule|send|review|follow|prepare|update)\b/i,
  /\bwaiting (on|for)\b/i,
  /\b(due|deadline|asap|eod|end of day)\b/i,
];

const ASSIGNMENT_PREFIX =
  /^(.{0,80}?)(?:,|\s+)(?:can you|could you|will you|please|I need you to|you'll|you will|to)\b/i;

const MIN_SENTENCE_LENGTH = 12;
const MAX_TITLE_LENGTH = 140;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= MIN_SENTENCE_LENGTH);
}

function sentenceHasActionLanguage(sentence: string): boolean {
  return TRANSCRIPT_ACTION_PATTERNS.some((pattern) => pattern.test(sentence));
}

function buildActionTitle(sentence: string): string {
  const trimmed = sentence.trim();
  if (trimmed.length <= MAX_TITLE_LENGTH) return trimmed;

  const prefixMatch = trimmed.match(ASSIGNMENT_PREFIX);
  if (prefixMatch?.[1] && prefixMatch[1].length >= 20) {
    return `${prefixMatch[1].trim()}…`;
  }

  return `${trimmed.slice(0, MAX_TITLE_LENGTH - 1)}…`;
}

function normalizeActionKey(title: string): string {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}

function itemMentionsViewer(
  item: Omit<TranscriptActionItem, "mentionsViewer">,
  viewerId?: string
): boolean {
  if (!viewerId) return false;
  return item.assigneeUserIds.includes(viewerId);
}

export function extractTranscriptActionItems(
  transcript: string,
  teamMembers: MentionUser[],
  viewerId?: string
): TranscriptActionItem[] {
  if (!transcript.trim() || teamMembers.length === 0) return [];

  const seen = new Set<string>();
  const items: TranscriptActionItem[] = [];

  for (const sentence of splitSentences(transcript)) {
    if (!sentenceHasActionLanguage(sentence)) continue;

    const spoken = detectSpokenReferences(sentence, teamMembers);
    const assigneeUserIds = spoken.map((m) => m.userId);
    const assigneeAliases = spoken.map((m) => m.alias);
    const title = buildActionTitle(sentence);
    const key = normalizeActionKey(title);

    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      title,
      excerpt: sentence,
      assigneeUserIds,
      assigneeAliases,
      mentionsViewer: itemMentionsViewer(
        { title, excerpt: sentence, assigneeUserIds, assigneeAliases },
        viewerId
      ),
    });
  }

  return items;
}

export function analyzeMeetingTranscript(
  transcript: string | undefined,
  teamMembers: MentionUser[],
  viewerId?: string
): MeetingTranscriptAnalysis {
  const empty: MeetingTranscriptAnalysis = {
    actionItems: [],
    mentionedUserIds: [],
    viewerMentioned: false,
    viewerHasAssignedAction: false,
    priorityBoost: 0,
    priorityReasons: [],
    tags: [],
  };

  if (!transcript?.trim() || teamMembers.length === 0) {
    return empty;
  }

  const actionItems = extractTranscriptActionItems(
    transcript,
    teamMembers,
    viewerId
  );
  const allMentioned = detectSpokenReferences(transcript, teamMembers);
  const mentionedUserIds = [...new Set(allMentioned.map((m) => m.userId))];
  const viewerMentioned = viewerId
    ? mentionedUserIds.includes(viewerId)
    : false;
  const viewerHasAssignedAction = actionItems.some((item) => item.mentionsViewer);

  const tags: string[] = [];
  const priorityReasons: string[] = [];
  let priorityBoost = 0;

  if (actionItems.length > 0) {
    tags.push("action-required");
    priorityBoost += Math.min(2, actionItems.length);
    priorityReasons.push(
      `Transcript suggests ${actionItems.length} action item${actionItems.length === 1 ? "" : "s"}`
    );
  }

  if (mentionedUserIds.length > 0) {
    tags.push("mention");
    const names = allMentioned.map((m) => m.alias).join(", ");
    priorityReasons.push(`Transcript references team member(s): ${names}`);
    priorityBoost += 1;
  }

  if (viewerMentioned) {
    tags.push("mentioned-you");
    const alias = allMentioned.find((m) => m.userId === viewerId)?.alias;
    priorityReasons.push(
      `Transcript references you${alias ? ` (${alias})` : ""}`
    );
    priorityBoost += MENTION_PRIORITY_BOOST;
  }

  if (viewerHasAssignedAction) {
    tags.push("your-action");
    priorityReasons.push("Transcript assigns action to you");
    priorityBoost += 2;
  }

  return {
    actionItems,
    mentionedUserIds,
    viewerMentioned,
    viewerHasAssignedAction,
    priorityBoost,
    priorityReasons,
    tags,
  };
}

/** Merge AI/Webex summary bullets with transcript-derived items (deduped). */
export function mergeMeetingActionItems(
  summaryItems: string[],
  transcriptItems: TranscriptActionItem[]
): Array<{
  title: string;
  assigneeUserIds: string[];
  source: "summary" | "transcript";
}> {
  const merged: Array<{
    title: string;
    assigneeUserIds: string[];
    source: "summary" | "transcript";
  }> = [];
  const seen = new Set<string>();

  for (const title of summaryItems) {
    const trimmed = title.trim();
    if (!trimmed) continue;
    const key = normalizeActionKey(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ title: trimmed, assigneeUserIds: [], source: "summary" });
  }

  for (const item of transcriptItems) {
    const key = normalizeActionKey(item.title);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      title: item.title,
      assigneeUserIds: item.assigneeUserIds,
      source: "transcript",
    });
  }

  return merged;
}
