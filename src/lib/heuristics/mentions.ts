export interface MentionUser {
  id: string;
  name: string | null;
  email: string;
}

export interface MentionMatch {
  userId: string;
  alias: string;
}

/** Build @mention aliases from a user's display name and email. */
export function buildMentionAliases(
  name: string | null | undefined,
  email: string
): string[] {
  const aliases = new Set<string>();
  const trimmed = name?.trim();

  if (trimmed) {
    aliases.add(trimmed);
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts[0] && parts[0].length >= 2) {
      aliases.add(parts[0]);
    }
  }

  const localPart = email.split("@")[0]?.replace(/[._]/g, " ").trim();
  if (localPart && localPart.length >= 2) {
    aliases.add(localPart);
  }

  return [...aliases].sort((a, b) => b.length - a.length);
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
  const pattern = new RegExp(`@${escaped}(?![\\w])`, "i");
  return pattern.test(text);
}

/** Spoken name reference in transcript or prose (no @ prefix). */
export function textReferencesAlias(text: string, alias: string): boolean {
  if (!alias || alias.length < 2) return false;

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
  viewerId: string
): boolean {
  return mentionedUserIds?.includes(viewerId) ?? false;
}

/** Personal priority boost when the logged-in user is @mentioned. */
export const MENTION_PRIORITY_BOOST = 4;
