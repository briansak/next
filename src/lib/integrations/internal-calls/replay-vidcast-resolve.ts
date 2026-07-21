import {
  extractVidcastShareUrl,
  isVidcastReplayUrl,
  parseVidcastShareId,
} from "../webex/vidcast-api";

const REDIRECT_LIMIT = 8;
const FETCH_TIMEOUT_MS = 12_000;

const MASKED_REPLAY_PATTERNS = [
  /campaignmgr\.cisco\.com/i,
  /\.eloqua\.com/i,
  /en25\.com/i,
  /elqTrackId/i,
];

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export function isMaskedReplayUrl(url: string): boolean {
  if (isVidcastReplayUrl(url)) return false;
  return MASKED_REPLAY_PATTERNS.some((pattern) => pattern.test(url));
}

function extractHttpUrls(text: string): string[] {
  const urls = new Set<string>();
  for (const match of text.matchAll(/https?:\/\/[^\s<>"')]+/gi)) {
    urls.add(match[0].replace(/[),.]+$/g, ""));
  }
  return [...urls];
}

function vidcastUrlFromHtml(html: string): string | null {
  const direct = extractVidcastShareUrl(html);
  if (direct) return direct;

  const metaRefresh = html.match(
    /content=["'][^"']*url=(https?:\/\/[^"'>\s]*vidcast\.io[^"'>\s]*)/i
  );
  if (metaRefresh?.[1]) return metaRefresh[1];

  const windowLocation = html.match(
    /(?:window\.)?location(?:\.href)?\s*=\s*["'](https?:\/\/[^"']*vidcast\.io[^"']*)["']/i
  );
  if (windowLocation?.[1]) return windowLocation[1];

  return null;
}

export async function followRedirectsToVidcast(startUrl: string): Promise<string | null> {
  let current = startUrl;

  for (let hop = 0; hop < REDIRECT_LIMIT; hop++) {
    if (parseVidcastShareId(current)) {
      return current;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": DEFAULT_USER_AGENT },
      });

      const location = response.headers.get("location");
      if (location && response.status >= 300 && response.status < 400) {
        current = new URL(location, current).toString();
        continue;
      }

      const html = await response.text();
      const fromHtml = vidcastUrlFromHtml(html);
      if (fromHtml) return fromHtml;

      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  return parseVidcastShareId(current) ? current : null;
}

export async function resolveVidcastShareUrl(input: {
  replayUrl?: string | null;
  text?: string;
}): Promise<string | null> {
  const text = input.text ?? "";
  const directFromText = extractVidcastShareUrl(text);
  if (directFromText) return directFromText;

  if (input.replayUrl && isVidcastReplayUrl(input.replayUrl)) {
    return input.replayUrl;
  }

  const candidates: string[] = [];
  if (input.replayUrl) candidates.push(input.replayUrl);

  for (const url of extractHttpUrls(text)) {
    if (isVidcastReplayUrl(url) || isMaskedReplayUrl(url)) {
      candidates.push(url);
    }
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = candidate.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    if (isVidcastReplayUrl(normalized)) {
      return normalized;
    }

    if (isMaskedReplayUrl(normalized)) {
      const resolved = await followRedirectsToVidcast(normalized);
      if (resolved) return resolved;
    }
  }

  return null;
}
