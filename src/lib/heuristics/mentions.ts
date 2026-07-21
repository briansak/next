export interface MentionUser {
  id: string;
  name: string | null;
  email: string;
}

export interface MentionMatch {
  userId: string;
  alias: string;
}

const MIN_ALIAS_LENGTH = 2;

/** Build @mention aliases from a user's display name and email. */
export function buildMentionAliases(
  name: string | null | undefined,
  email: string
): string[] {
  const nameAliases = new Set<string>();
  const emailAliases = new Set<string>();
  const normalizedEmail = email.trim().toLowerCase();

  if (normalizedEmail.includes("@")) {
    emailAliases.add(normalizedEmail);

    const localPart = normalizedEmail.split("@")[0] ?? "";
    if (localPart.length >= MIN_ALIAS_LENGTH) {
      emailAliases.add(localPart);
    }

    const localSpaced = localPart.replace(/[._-]+/g, " ").trim();
    if (
      localSpaced.length >= MIN_ALIAS_LENGTH &&
      localSpaced !== localPart
    ) {
      emailAliases.add(localSpaced);
    }
  }

  const trimmed = name?.trim();
  if (trimmed) {
    nameAliases.add(trimmed);

    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts[0] && parts[0].length >= MIN_ALIAS_LENGTH) {
      nameAliases.add(parts[0]);
    }
  }

  const byLength = (a: string, b: string) => b.length - a.length;
  const ordered = [
    ...[...nameAliases].sort(byLength),
    ...[...emailAliases].sort(byLength),
  ];

  const seen = new Set<string>();
  return ordered.filter((alias) => {
    const key = alias.toLowerCase();
    if (seen.has(key) || alias.length < MIN_ALIAS_LENGTH) return false;
    seen.add(key);
    return true;
  });
}

/** Returns which team members are @mentioned in the message text. */
export function detectMentions(text: string, users: MentionUser[]): MentionMatch[] {
  const matches: MentionMatch[] = [];

  for (const user of users) {
    const aliases = buildMentionAliases(user.name, user.email);
    for (const alias of aliases) {
      if (textMentionsAlias(text, alias)) {
        matches.push({ userId: user.id, alias });
        break;
      }
    }
  }

  return matches;
}

export function textMentionsAlias(text: string, alias: string): boolean {
  if (!alias || !text.includes("@")) return false;

  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`@${escaped}(?![\\w@])`, "i");
  return pattern.test(text);
}

/** True when the viewer's name or email appears as an @mention in text. */
export function viewerMentionedInText(
  text: string | undefined | null,
  viewer: MentionUser
): boolean {
  if (!text?.includes("@")) return false;

  const aliases = buildMentionAliases(viewer.name, viewer.email);
  return aliases.some((alias) => textMentionsAlias(text, alias));
}

/** Spoken name reference in transcript or prose (no @ prefix). */
export function textReferencesAlias(text: string, alias: string): boolean {
  if (!alias || alias.length < MIN_ALIAS_LENGTH) return false;

  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

/** Returns team members referenced by spoken name in transcript text. */
export function detectSpokenReferences(
  text: string,
  users: MentionUser[]
): MentionMatch[] {
  const matches: MentionMatch[] = [];

  for (const user of users) {
    const aliases = buildMentionAliases(user.name, user.email);
    for (const alias of aliases) {
      if (textReferencesAlias(text, alias)) {
        matches.push({ userId: user.id, alias });
        break;
      }
    }
  }

  return matches;
}

export function viewerIsMentioned(
  mentionedUserIds: string[] | undefined,
  viewerId: string,
  options?: { text?: string | null; viewer?: MentionUser }
): boolean {
  if (mentionedUserIds?.includes(viewerId)) return true;
  if (options?.text && options.viewer?.id === viewerId) {
    return viewerMentionedInText(options.text, options.viewer);
  }
  return false;
}

/** Personal priority boost when the logged-in user is @mentioned. */
export const MENTION_PRIORITY_BOOST = 4;
