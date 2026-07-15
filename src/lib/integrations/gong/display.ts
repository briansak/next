export interface GongSummaryDisplay {
  overview: string | null;
  takeaways: string[];
}

const SECTION_HEADER =
  /^(?:summary|overview|call summary|meeting summary|key (?:takeaways|points|updates)|highlights|topics discussed)\s*:?\s*$/i;

const BOILERPLATE_LINE =
  /^(?:view (?:call|recording)|attendees|participants|gong\.io|https?:\/\/)/i;

function normalizeLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseBulletLine(line: string): string | null {
  const bullet = line.match(/^[-*•]\s+(.+)$/);
  if (bullet?.[1]) return bullet[1].trim();

  const numbered = line.match(/^\d+[.)]\s+(.+)$/);
  if (numbered?.[1]) return numbered[1].trim();

  return null;
}

function splitIntoSentences(text: string): string[] {
  return (
    text
      .match(/[^.!?]+[.!?]+/g)
      ?.map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length >= 18) ?? []
  );
}

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

export function formatGongSummaryForDisplay(
  text: string,
  options?: { maxTakeaways?: number }
): GongSummaryDisplay {
  const trimmed = text.trim();
  if (!trimmed) {
    return { overview: null, takeaways: [] };
  }

  const maxTakeaways = options?.maxTakeaways ?? 12;
  const lines = normalizeLines(trimmed);
  const bullets: string[] = [];
  const prose: string[] = [];

  for (const line of lines) {
    if (SECTION_HEADER.test(line) || BOILERPLATE_LINE.test(line)) continue;

    const bullet = parseBulletLine(line);
    if (bullet) {
      bullets.push(bullet);
      continue;
    }

    if (line.length >= 10) {
      prose.push(line);
    }
  }

  if (bullets.length > 0) {
    const overview = prose.length > 0 ? prose[0] : null;
    return {
      overview,
      takeaways: dedupeItems(bullets).slice(0, maxTakeaways),
    };
  }

  const combined = prose.join(" ") || trimmed.replace(/\s+/g, " ");
  const sentences = splitIntoSentences(combined);

  if (sentences.length >= 4) {
    return {
      overview: sentences[0],
      takeaways: dedupeItems(sentences.slice(1)).slice(0, maxTakeaways),
    };
  }

  if (sentences.length >= 2) {
    return {
      overview: null,
      takeaways: dedupeItems(sentences).slice(0, maxTakeaways),
    };
  }

  return {
    overview: combined,
    takeaways: [],
  };
}

export function formatGongSummaryPreview(text: string): GongSummaryDisplay {
  const full = formatGongSummaryForDisplay(text, { maxTakeaways: 8 });
  return {
    overview: full.overview,
    takeaways: full.takeaways.slice(0, 3),
  };
}

export function gongSummaryHasStructuredContent(display: GongSummaryDisplay): boolean {
  return Boolean(display.overview?.trim()) || display.takeaways.length > 0;
}
