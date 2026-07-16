import type { EmailMessage } from "./allowlist";
import { normalizeEmailBodyText } from "./body-text";
import { condenseLongSummary } from "../../heuristics/email-digest-summary";

export interface ProductAnnouncementContent {
  messageId: string;
  subject: string;
  productName: string;
  productVersion?: string;
  vendor?: string;
  technologyLabel: string;
  summary: string;
  learnMoreUrl?: string;
  receivedAt: Date;
  fromAddress: string;
  fromName?: string;
  bodyText: string;
}

const STRONG_SUBJECT_PATTERNS = [
  /^introducing\b/i,
  /^announcing\b/i,
  /^new release:/i,
  /product announcement/i,
  /general availability/i,
  /\bnow shipping\b/i,
];

const SUPPORTING_SUBJECT_PATTERNS = [
  /\bnow available\b/i,
  /\bnew capabilities\b/i,
  /\bwhat'?s new\b/i,
];

const EXCLUDE_SUBJECT_PATTERNS = [
  /^you'?re registered\b/i,
  /your (?:statement|invoice|receipt)\b/i,
  /investment tracker/i,
  /webinar has been approved/i,
  /meeting invitation/i,
  /^invitation:/i,
  /^accepted:/i,
  /^declined:/i,
  /^updated:/i,
  /black belt\b/i,
  /\bcourse\b/i,
  /\btraining\b/i,
  /\bcertification\b/i,
  /internal only/i,
  /field notice/i,
];

const EXCLUDE_BODY_PATTERNS = [
  /your registration for this webex webinar has been approved/i,
  /log on to view your statement/i,
  /conversation-id\s+\d+/i,
];

const TECHNOLOGY_LABEL_RULES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /isovalent|tetragon|cilium|hubble|runtime security/i, label: "Cloud Native Security" },
  { pattern: /splunk|observability/i, label: "Security & Observability" },
  { pattern: /bluecat|livewire|livenx|micetro|dns|dhcp/i, label: "Networking" },
  {
    pattern: /catalyst|meraki|nexus|networking platform|aci|sd-?wan|routing|switching/i,
    label: "Networking",
  },
  { pattern: /umbrella|secure|firewall|xdr|threat|security/i, label: "Security" },
  { pattern: /webex|collab|calling/i, label: "Collaboration" },
  { pattern: /ucs|compute|server|hyperflex/i, label: "Compute" },
  { pattern: /dna|thousandeyes|monitoring/i, label: "Observability" },
];

const VENDOR_FROM_PATTERNS: Array<{ pattern: RegExp; vendor: string }> = [
  { pattern: /product-notifications@/i, vendor: "Product notifications" },
  { pattern: /@isovalent\./i, vendor: "Isovalent" },
  { pattern: /@splunk\./i, vendor: "Splunk" },
  { pattern: /@bluecat/i, vendor: "BlueCat" },
  { pattern: /@cisco\./i, vendor: "Cisco" },
];

function plainText(body: string): string {
  return normalizeEmailBodyText(body).replace(/\s+/g, " ").trim();
}

function stripBoilerplate(text: string): string {
  return text
    .replace(/conversation-id\s+\d+[\s\S]*/i, "")
    .replace(/remote-id\s+[A-Za-z0-9+/=]+/i, "")
    .replace(/-~-~-~-~-[^]*$/i, "")
    .replace(/view in browser[\s\S]*$/i, "")
    .replace(/unsubscribe[\s\S]*$/i, "")
    .trim();
}

export function extractProductNameFromSubject(subject: string): {
  productName: string;
  productVersion?: string;
} {
  const trimmed = subject.trim();

  const prefixed =
    trimmed.match(/^(?:introducing|announcing)\s+(.+)$/i)?.[1] ??
    trimmed.match(/^new release:\s*(.+)$/i)?.[1] ??
    trimmed.match(/^product announcement:\s*(.+)$/i)?.[1];

  const productName = (prefixed ?? trimmed).replace(/\s+-\s+.+$/, "").trim();
  const version =
    productName.match(/(\d+\.\d+(?:\.\d+)?)\s*$/)?.[1] ??
    trimmed.match(/\b(?:v|version)\s*(\d+(?:\.\d+)+)/i)?.[1];

  return { productName, productVersion: version };
}

export function inferTechnologyLabel(
  productName: string,
  subject: string,
  body: string
): string {
  const haystack = `${productName} ${subject} ${body}`.toLowerCase();
  for (const rule of TECHNOLOGY_LABEL_RULES) {
    if (rule.pattern.test(haystack)) return rule.label;
  }
  return "Product updates";
}

export function inferVendor(fromAddress: string, productName: string): string | undefined {
  for (const rule of VENDOR_FROM_PATTERNS) {
    if (rule.pattern.test(fromAddress)) return rule.vendor;
  }

  const firstToken = productName.split(/\s+/)[0];
  if (firstToken && firstToken.length >= 3) return firstToken;
  return undefined;
}

export function isProductAnnouncementEmail(
  subject: string,
  body: string,
  fromAddress?: string
): boolean {
  const trimmedSubject = subject.trim();
  if (!trimmedSubject || trimmedSubject.length < 12) return false;

  if (EXCLUDE_SUBJECT_PATTERNS.some((pattern) => pattern.test(trimmedSubject))) {
    return false;
  }

  const text = plainText(body);
  if (EXCLUDE_BODY_PATTERNS.some((pattern) => pattern.test(text))) {
    return false;
  }

  if (STRONG_SUBJECT_PATTERNS.some((pattern) => pattern.test(trimmedSubject))) {
    return text.length >= 80 || Boolean(fromAddress?.includes("product-notifications"));
  }

  const hasSupportingSubject = SUPPORTING_SUBJECT_PATTERNS.some((pattern) =>
    pattern.test(trimmedSubject)
  );
  if (!hasSupportingSubject) return false;

  const productSignals =
    /\b(?:release|platform|version|capabilities|features|module|solution)\b/i.test(
      `${trimmedSubject} ${text.slice(0, 1200)}`
    ) || Boolean(fromAddress && /product-notifications@/i.test(fromAddress));

  return productSignals && text.length >= 120;
}

function extractBulletHighlights(text: string): string[] {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^[\s•*\-–—]+/, "").trim())
    .filter((line) => line.length >= 24 && line.length <= 280);

  const bullets = lines.filter((line) =>
    /^(?:new|enhanced|improved|introducing|support for|adds|includes|delivers|now)\b/i.test(
      line
    )
  );

  if (bullets.length >= 2) return bullets.slice(0, 6);

  const sentences =
    text.match(/[^.!?]+[.!?]+/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];

  return sentences
    .filter((sentence) => sentence.length >= 40 && sentence.length <= 220)
    .slice(0, 4);
}

export function summarizeProductAnnouncement(
  subject: string,
  body: string,
  productName: string
): string {
  const plain = stripBoilerplate(plainText(body));
  const condensed = condenseLongSummary(plain, subject);
  if (condensed?.includes("\n- ")) {
    return condensed.slice(0, 4000);
  }

  const highlights = extractBulletHighlights(plain);
  if (highlights.length >= 2) {
    return `${productName}\n${highlights.map((item) => `- ${item}`).join("\n")}`.slice(
      0,
      4000
    );
  }

  const paragraphs = plain
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length >= 60 && !/^hi[, ]/i.test(chunk))
    .slice(0, 2);

  if (paragraphs.length > 0) {
    const overview = paragraphs[0]!;
    const trimmedOverview =
      overview.length > 320 ? `${overview.slice(0, 317).trim()}…` : overview;
    return `${productName}\n- ${trimmedOverview}`.slice(0, 4000);
  }

  const fallback = plain.slice(0, 320);
  return `${productName}\n- ${fallback}`.slice(0, 4000);
}

function extractLearnMoreUrl(text: string): string | undefined {
  const urls = text.match(/https?:\/\/[^\s<>()"']+/gi) ?? [];
  const scored = urls
    .map((url) => ({
      url: url.replace(/[),.]+$/, ""),
      score: scoreLearnMoreUrl(url),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.url;
}

function scoreLearnMoreUrl(url: string): number {
  if (/unsubscribe|privacy|preferences|webex\.com\/webinar/i.test(url)) return 0;
  if (/learn more|release|docs|product|platform|isovalent|splunk|cisco|bluecat/i.test(url)) {
    return 3;
  }
  if (/\.(com|io|net)\//i.test(url)) return 1;
  return 0;
}

export function parseProductAnnouncementEmail(
  message: EmailMessage
): ProductAnnouncementContent | null {
  if (!isProductAnnouncementEmail(message.subject, message.body, message.fromAddress)) {
    return null;
  }

  const bodyText = plainText(message.body);
  const { productName, productVersion } = extractProductNameFromSubject(message.subject);
  const technologyLabel = inferTechnologyLabel(
    productName,
    message.subject,
    bodyText
  );
  const vendor = inferVendor(message.fromAddress, productName);
  const summary = summarizeProductAnnouncement(
    message.subject,
    message.body,
    productName
  );

  return {
    messageId: message.messageId,
    subject: message.subject,
    productName,
    productVersion,
    vendor,
    technologyLabel,
    summary,
    learnMoreUrl: extractLearnMoreUrl(bodyText),
    receivedAt: message.receivedAt,
    fromAddress: message.fromAddress,
    fromName: message.fromName,
    bodyText,
  };
}
