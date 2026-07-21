import type { EmailAllowlistRule } from "./allowlist";

export type PartnerRuleKind = "domain" | "subjectPrefix" | "address";

export interface PartnerCoverageConfig {
  domains: string[];
  addresses: string[];
  subjectPrefixes: string[];
}

export interface ParsedPartnerRuleInput {
  kind: PartnerRuleKind;
  value: string;
}

export function normalizePartnerDomain(value: string): string | null {
  const trimmed = value.trim().toLowerCase().replace(/^@+/, "");
  if (!trimmed || trimmed.includes("@") || trimmed.includes(" ")) return null;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(trimmed)) return null;
  return trimmed;
}

export function normalizePartnerSubjectPrefix(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 40) return null;
  return trimmed;
}

export function normalizePartnerAddress(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

export function parsePartnerRuleInput(input: {
  kind: PartnerRuleKind;
  value: string;
}): ParsedPartnerRuleInput | null {
  const value =
    input.kind === "domain"
      ? normalizePartnerDomain(input.value)
      : input.kind === "subjectPrefix"
        ? normalizePartnerSubjectPrefix(input.value)
        : normalizePartnerAddress(input.value);

  if (!value) return null;
  return { kind: input.kind, value };
}

export function partnerCoverageFromRules(
  rules: EmailAllowlistRule[]
): PartnerCoverageConfig {
  const domains = new Set<string>();
  const addresses = new Set<string>();
  const subjectPrefixes = new Set<string>();

  for (const rule of rules) {
    const domain = rule.fromDomain ? normalizePartnerDomain(rule.fromDomain) : null;
    if (domain) domains.add(domain);

    const address = rule.fromAddress ? normalizePartnerAddress(rule.fromAddress) : null;
    if (address) addresses.add(address);

    const prefix = rule.subjectPrefix
      ? normalizePartnerSubjectPrefix(rule.subjectPrefix)
      : null;
    if (prefix) subjectPrefixes.add(prefix);
  }

  return {
    domains: [...domains],
    addresses: [...addresses],
    subjectPrefixes: [...subjectPrefixes],
  };
}

export function formatPartnerRuleLabel(rule: EmailAllowlistRule): string {
  if (rule.fromDomain) return `Domain @${rule.fromDomain}`;
  if (rule.fromAddress) return `Address ${rule.fromAddress}`;
  if (rule.subjectPrefix) return `Subject prefix ${rule.subjectPrefix}`;
  return "Rule";
}

export function isPartnerSenderAddress(
  fromAddress: string | null | undefined,
  config: PartnerCoverageConfig
): boolean {
  const from = fromAddress?.trim().toLowerCase() ?? "";
  if (!from) return false;

  if (config.addresses.includes(from)) return true;
  return config.domains.some((domain) => from.endsWith(`@${domain}`));
}

export function subjectMatchesPartnerPrefix(
  subject: string | null | undefined,
  config: PartnerCoverageConfig
): boolean {
  const text = subject ?? "";
  return config.subjectPrefixes.some((prefix) => text.startsWith(prefix));
}
