export type InternalCallType =
  | "all-hands"
  | "technology-call"
  | "enablement"
  | "town-hall";

export interface InternalCallClassification {
  type: InternalCallType;
  label: string;
}

const INTERNAL_CALL_RULES: Array<{
  type: InternalCallType;
  label: string;
  patterns: RegExp[];
}> = [
  {
    type: "all-hands",
    label: "All hands",
    patterns: [
      /\ball[\s-]?hands\b/i,
      /\bcompany[\s-]?(?:wide\s+)?(?:meeting|update|sync)\b/i,
      /\bquarterly\s+business\s+review\b/i,
      /\bqbr\b/i,
    ],
  },
  {
    type: "town-hall",
    label: "Town hall",
    patterns: [/\btown\s*hall\b/i, /\btownhall\b/i],
  },
  {
    type: "technology-call",
    label: "Technology call",
    patterns: [
      /\btechnology\s*call\b/i,
      /\btech\s*call\b/i,
      /\btech\s*talk\b/i,
      /\bproduct\s*(?:update|briefing|roadmap)\b/i,
      /\barchitecture\s*(?:review|forum)\b/i,
      /\bplatform\s*update\b/i,
      /\bin this session\b/i,
      /\blatest on our portfolio\b/i,
      /\bexclusive live demos?\b/i,
      /\bbridge\b.*\b(?:session|replay|portfolio)\b/i,
      /\b(?:session|replay|portfolio)\b.*\bbridge\b/i,
    ],
  },
  {
    type: "enablement",
    label: "Enablement",
    patterns: [
      /\benablement\b/i,
      /\bbrown\s*bag\b/i,
      /\boffice\s*hours\b/i,
      /\btraining\s*session\b/i,
      /\bskill\s*builder\b/i,
      /\bnew\s+hire\s+(?:orientation|onboarding)\b/i,
    ],
  },
];

export const INTERNAL_CALL_LOOKBACK_DAYS = 60;

export function classifyInternalCall(
  title: string,
  subject?: string,
  body?: string
): InternalCallClassification | null {
  const haystack = `${title} ${subject ?? ""} ${body ?? ""}`.trim();
  if (!haystack) return null;

  for (const rule of INTERNAL_CALL_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(haystack))) {
      return { type: rule.type, label: rule.label };
    }
  }

  return null;
}

export function internalCallTypeLabel(type: InternalCallType): string {
  return INTERNAL_CALL_RULES.find((rule) => rule.type === type)?.label ?? type;
}
