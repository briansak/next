import { fixMojibake, normalizeEmailBodyText } from "../integrations/email/body-text";

const DIGEST_SUBJECT_PATTERNS = [
  /partner\s*pulse/i,
  /partner\s*(?:newsletter|digest|update|brief)/i,
  /weekly\s*digest/i,
  /monthly\s*(?:update|newsletter)/i,
];

const TOPIC_SPLIT =
  /(?<=[.!?])\s+(?=(?:Get (?:ready|the latest)|The |Catch the|Learn how|Join our|Nominations|Register|Apply|Extend your|Access |Explore |Don't|It'?s time))/i;

function dedupeItems(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function splitDigestTopics(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  const byTopic = normalized
    .split(TOPIC_SPLIT)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length >= 24);

  if (byTopic.length >= 2) return byTopic;

  const sentences =
    normalized.match(/[^.!?]+[.!?]+/g)?.map((s) => s.trim()).filter((s) => s.length >= 30) ??
    [];

  return sentences.length >= 3 ? sentences : [normalized];
}

function extractDigestHighlights(plain: string): string[] {
  const items: string[] = [];

  if (/\.conf\d+/i.test(plain)) {
    const when = plain.match(/September \d+-\d+/i)?.[0];
    items.push(
      when
        ? `Splunk .conf26 (${when}, Denver) + Splunk University + Boss of the SOC`
        : "Splunk .conf26 — register or apply to sponsor by July 31"
    );
  }

  if (/Regional Partner Awards/i.test(plain)) {
    const deadline = plain.match(/Nominations due by ([^.!]+)/i)?.[1]?.trim();
    items.push(
      deadline
        ? `Regional Partner Awards — nominations due ${deadline}`
        : "Regional Partner Awards — submit nominations"
    );
  }

  const integrationSession = plain.match(
    /Get the latest on ([^.]+)\.\s*Join our leaders on ([^.!?]+)/i
  );
  if (integrationSession) {
    items.push(
      `Cisco + Splunk update (${integrationSession[2].trim()}): ${integrationSession[1].trim()}`
    );
  } else if (/Join our leaders on/i.test(plain)) {
    const when = plain.match(/Join our leaders on ([^.!?]+)/i)?.[1]?.trim();
    if (when) items.push(`Partner briefing — ${when}`);
  }

  if (/Cisco Live US/i.test(plain)) {
    const when = plain.match(
      /Cisco Live US 2026[^.]*on (June \d+ at [^.!]+)/i
    )?.[1]?.trim();
    items.push(
      when ? `Cisco Live US 2026 recap — ${when}` : "Cisco Live US 2026 recap session"
    );
  }

  if (/ingest AWS data|AWS data into Splunk/i.test(plain)) {
    items.push("AWS → Splunk ingestion session — demos and best practices");
  }

  if (/Hidden Costs of Downtime|Partner Marketing Center/i.test(plain)) {
    items.push("Hidden Costs of Downtime campaign kit — assets in PMC");
  }

  return items;
}

function compressDigestItem(chunk: string): string {
  const sessionMatch = chunk.match(/Join our leaders on ([^.!?]+)/i);
  if (sessionMatch) {
    const when = sessionMatch[1].trim();
    const topic = chunk.match(/Get the latest on ([^.]+)/i)?.[1]?.trim();
    return topic ? `Session (${when}): ${topic}` : `Session: ${when}`;
  }

  if (/Cisco Live/i.test(chunk)) {
    const when = chunk.match(/on (June \d+[^.!]*)/i)?.[1]?.trim();
    return when
      ? `Cisco Live US 2026 recap (${when})`
      : "Cisco Live US 2026 recap session";
  }

  if (/\.conf\d+/i.test(chunk)) {
    const event = chunk.match(/(Splunk \.conf\d+[^.!]*)/i)?.[1] ?? "Splunk .conf26";
    const when = chunk.match(/(September \d+-\d+[^.!]*)/i)?.[1];
    const sponsor = chunk.match(/(through [^.!]+)/i)?.[1];
    const parts = [event];
    if (when) parts.push(when);
    if (sponsor) parts.push(`sponsor by ${sponsor}`);
    return parts.join(" — ");
  }

  if (/nomination|partner awards/i.test(chunk)) {
    const deadline = chunk.match(/(?:due by|by) ([^.!]+)/i)?.[1]?.trim();
    return deadline
      ? `Regional Partner Awards — nominations due ${deadline}`
      : "Regional Partner Awards — submit nominations";
  }

  if (/AWS/i.test(chunk)) {
    return "AWS data ingestion into Splunk — session with demos and best practices";
  }

  if (/campaign kit|PMC|Partner Marketing Center|Hidden Costs of Downtime/i.test(chunk)) {
    return "Hidden Costs of Downtime campaign kit — assets in Partner Marketing Center";
  }

  const first = chunk.match(/^[^.!?]+[.!?]?/)?.[0]?.trim() ?? chunk;
  return first.length > 140 ? `${first.slice(0, 137).trim()}…` : first;
}

export function isDigestEmail(subject: string, body: string): boolean {
  const plain = normalizeEmailBodyText(body);
  if (DIGEST_SUBJECT_PATTERNS.some((pattern) => pattern.test(subject))) {
    return plain.length >= 120;
  }
  return plain.length >= 400 && splitDigestTopics(plain).length >= 3;
}

export function distillEmailDigest(subject: string, body: string): string | null {
  const plain = fixMojibake(normalizeEmailBodyText(body));
  if (!isDigestEmail(subject, plain)) return null;

  const highlights = dedupeItems(extractDigestHighlights(plain));
  const topics =
    highlights.length >= 2
      ? highlights
      : dedupeItems(splitDigestTopics(plain).map(compressDigestItem));

  if (topics.length < 2) return null;

  const overview = subject.trim() || "Partner newsletter";
  return `${overview}\n${topics.slice(0, 10).map((topic) => `- ${topic}`).join("\n")}`;
}

export function condenseLongSummary(text: string, subject?: string): string | null {
  const trimmed = fixMojibake(text.trim());
  if (trimmed.length < 280) return null;

  if (trimmed.includes("\n- ")) {
    return trimmed;
  }

  const distilled = distillEmailDigest(subject ?? "", trimmed);
  if (distilled) return distilled;

  const topics = dedupeItems(splitDigestTopics(trimmed).map(compressDigestItem)).slice(0, 6);
  if (topics.length < 3) return null;

  const overview = subject?.trim() || topics[0];
  const bullets = (subject?.trim() ? topics : topics.slice(1)).map((topic) => `- ${topic}`);
  return `${overview}\n${bullets.join("\n")}`;
}

export function digestSummaryPreview(text: string, maxBullets = 3): string {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const overview = lines.find((line) => !line.startsWith("- ")) ?? null;
  const bullets = lines.filter((line) => line.startsWith("- ")).slice(0, maxBullets);

  if (!overview && bullets.length === 0) return text.slice(0, 220);

  const parts = [overview, ...bullets.map((b) => b.slice(2))].filter(Boolean);
  return parts.join(" · ").slice(0, 320);
}
