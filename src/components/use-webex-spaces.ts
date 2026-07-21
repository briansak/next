"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { filterSpacesByQuery } from "@/lib/integrations/webex/space-display";

export interface WebexSpaceListItem {
  id: string;
  title: string;
  type: string;
  lastActivity?: string;
}

interface SpacesPayload {
  spaces: WebexSpaceListItem[];
  totalFetched: number;
  truncated: boolean;
}

let sharedPromise: Promise<SpacesPayload> | null = null;
let sharedPayload: SpacesPayload | null = null;

async function fetchAllSpaces(): Promise<SpacesPayload> {
  if (sharedPayload) return sharedPayload;
  if (sharedPromise) return sharedPromise;

  sharedPromise = fetch("/api/integrations/webex/spaces")
    .then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? "Failed to load spaces"
        );
      }
      return res.json() as Promise<SpacesPayload>;
    })
    .then((data) => {
      sharedPayload = {
        spaces: data.spaces ?? [],
        totalFetched: data.totalFetched ?? data.spaces?.length ?? 0,
        truncated: Boolean(data.truncated),
      };
      return sharedPayload;
    })
    .finally(() => {
      sharedPromise = null;
    });

  return sharedPromise;
}

/** Invalidate after reconnect so the next picker load refetches. */
export function invalidateWebexSpacesClientCache(): void {
  sharedPayload = null;
  sharedPromise = null;
}

export function useWebexSpaces(query: string) {
  const [allSpaces, setAllSpaces] = useState<WebexSpaceListItem[]>(
    sharedPayload?.spaces ?? []
  );
  const [totalFetched, setTotalFetched] = useState(sharedPayload?.totalFetched ?? 0);
  const [truncated, setTruncated] = useState(sharedPayload?.truncated ?? false);
  const [loading, setLoading] = useState(!sharedPayload);
  const [error, setError] = useState<string | null>(null);

  const loadSpaces = useCallback(async () => {
    if (sharedPayload) {
      setAllSpaces(sharedPayload.spaces);
      setTotalFetched(sharedPayload.totalFetched);
      setTruncated(sharedPayload.truncated);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchAllSpaces();
      setAllSpaces(data.spaces);
      setTotalFetched(data.totalFetched);
      setTruncated(data.truncated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load spaces");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSpaces();
  }, [loadSpaces]);

  const filteredSpaces = useMemo(
    () => filterSpacesByQuery(allSpaces, query),
    [allSpaces, query]
  );

  return {
    allSpaces,
    spaces: filteredSpaces,
    totalFetched,
    truncated,
    loading,
    error,
    reload: loadSpaces,
  };
}
