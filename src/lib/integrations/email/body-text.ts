/**
 * Normalize raw email bodies — decode base64 blobs, strip HTML, clean whitespace.
 * Marketing emails (e.g. Cisco Campaign Manager) often arrive as a single base64 block.
 */

export function isLikelyBase64Text(raw: string): boolean {
  const compact = raw.replace(/\s+/g, "").trim();
  if (compact.length < 80) return false;
  if (!/^[A-Za-z0-9+/]+=*$/.test(compact)) return false;
  return compact.length % 4 === 0;
}

export function tryDecodeBase64Text(raw: string): string | null {
  if (!isLikelyBase64Text(raw)) return null;

  try {
    const compact = raw.replace(/\s+/g, "");
    const decoded = Buffer.from(compact, "base64").toString("utf8");
    if (decoded.length < 40) return null;

    const nonPrintable = [...decoded].filter((ch) => {
      const code = ch.charCodeAt(0);
      return (
        (code < 9 || (code > 13 && code < 32) || code === 127) &&
        code !== 0
      );
    }).length;

    if (nonPrintable / decoded.length > 0.12) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\s*(https?:\/\/[^>]+)>/gi, " $1 ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, url, text) => {
      const label = String(text).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return label ? `${label} ${url}` : url;
    })
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const MOJIBAKE_REPLACEMENTS: Array<[string, string]> = [
  ["â€™", "'"],
  ["â€˜", "'"],
  ["â€œ", '"'],
  ["â€\u009d", '"'],
  ["â€\u009c", '"'],
  ["â€\u009d", '"'],
  ["â€“", "–"],
  ["â€”", "—"],
  ["â€¦", "…"],
  ["â€¢", "•"],
  ["Ã©", "é"],
  ["Ã¨", "è"],
  ["Ã¼", "ü"],
  ["Ã¶", "ö"],
  ["Ã¤", "ä"],
];

/** Repair UTF-8 text that was mis-decoded as Latin-1 (common in marketing emails). */
export function fixMojibake(text: string): string {
  let result = text;
  for (const [from, to] of MOJIBAKE_REPLACEMENTS) {
    if (result.includes(from)) {
      result = result.split(from).join(to);
    }
  }
  return result;
}

export function normalizeEmailBodyText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const decoded = tryDecodeBase64Text(trimmed);
  const source = decoded ?? trimmed;

  let plain: string;
  if (source.includes("<") && source.includes(">")) {
    plain = stripHtml(source);
  } else {
    plain = source.replace(/\r\n/g, "\n").trim();
  }

  return fixMojibake(plain);
}

export function looksLikeEncodedEmailBody(text: string): boolean {
  return isLikelyBase64Text(text.trim());
}
