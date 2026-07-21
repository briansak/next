/** Single-user Webex spaces cache (no tenant scoping). */

import type { ListSpacesResult } from "./index";

const CACHE_KEY = "default";
const cache = new Map<
  string,
  { result: ListSpacesResult; expiresAt: number }
>();

const TTL_MS = 5 * 60 * 1000;

export function getCachedWebexSpaces(): ListSpacesResult | null {
  const entry = cache.get(CACHE_KEY);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(CACHE_KEY);
    return null;
  }
  return entry.result;
}

export function setCachedWebexSpaces(result: ListSpacesResult): void {
  cache.set(CACHE_KEY, {
    result,
    expiresAt: Date.now() + TTL_MS,
  });
}

export function invalidateCachedWebexSpaces(): void {
  cache.delete(CACHE_KEY);
}
