import type { WebexSpace } from "./index";

/** Remove duplicate room IDs from paginated Webex results (keep newest activity). */
export function dedupeSpacesById(spaces: WebexSpace[]): WebexSpace[] {
  const byId = new Map<string, WebexSpace>();

  for (const space of spaces) {
    const existing = byId.get(space.id);
    if (!existing) {
      byId.set(space.id, space);
      continue;
    }

    const existingTime = existing.lastActivity
      ? new Date(existing.lastActivity).getTime()
      : 0;
    const nextTime = space.lastActivity
      ? new Date(space.lastActivity).getTime()
      : 0;
    if (nextTime >= existingTime) {
      byId.set(space.id, space);
    }
  }

  return [...byId.values()];
}

export function filterSpacesByQuery(
  spaces: WebexSpace[],
  query: string
): WebexSpace[] {
  const q = query.trim().toLowerCase();
  if (!q) return spaces;
  return spaces.filter((space) => space.title.toLowerCase().includes(q));
}

/** Build a subtitle that disambiguates duplicate room titles. */
export function spaceListSubtitle(
  space: WebexSpace,
  allSpaces: WebexSpace[]
): string {
  const normalized = space.title.trim().toLowerCase();
  const sameTitleCount = allSpaces.filter(
    (candidate) => candidate.title.trim().toLowerCase() === normalized
  ).length;

  const parts = [space.type];
  if (space.lastActivity) {
    parts.push(`last active ${formatRelativeShort(space.lastActivity)}`);
  }
  if (sameTitleCount > 1) {
    parts.push(`id …${space.id.slice(-8)}`);
  }
  return parts.join(" · ");
}

function formatRelativeShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
