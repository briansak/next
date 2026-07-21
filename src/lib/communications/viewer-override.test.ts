import { describe, expect, it } from "vitest";
import {
  addDashboardHiddenCommunicationId,
  applyViewerPriorityOverride,
  buildViewerOverride,
  getViewerOverride,
  mergeCommunicationMetadata,
  mergeViewerOverrideMetadata,
  parseDashboardHiddenCommunicationIds,
  priorityToScore,
  removeDashboardHiddenCommunicationId,
} from "./viewer-override";

describe("viewer priority overrides", () => {
  it("applies a stored override for the viewer", () => {
    const metadata = {
      viewerOverrides: {
        u1: buildViewerOverride("INFO", { hidden: true }),
      },
    };

    const applied = applyViewerPriorityOverride(7, "HIGH", metadata, "u1");
    expect(applied.priority).toBe("INFO");
    expect(applied.score).toBe(1);
    expect(applied.hidden).toBe(true);
    expect(applied.overridden).toBe(true);
  });

  it("honors dashboard hidden communication ids when metadata was refreshed", () => {
    const applied = applyViewerPriorityOverride(7, "HIGH", {}, "u1", {
      communicationId: "comm-1",
      hiddenCommunicationIds: ["comm-1"],
    });

    expect(applied.hidden).toBe(true);
    expect(applied.overridden).toBe(true);
    expect(applied.priority).toBe("INFO");
  });

  it("merges and clears overrides", () => {
    const metadata = mergeViewerOverrideMetadata(
      {},
      "u1",
      buildViewerOverride("LOW")
    );
    expect(getViewerOverride(metadata, "u1")?.priority).toBe("LOW");
    expect(priorityToScore("LOW")).toBe(3);

    const cleared = mergeViewerOverrideMetadata(metadata, "u1", null);
    expect(getViewerOverride(cleared, "u1")).toBeNull();
  });

  it("preserves viewer overrides when communication metadata is refreshed", () => {
    const merged = mergeCommunicationMetadata(
      {
        viewerOverrides: {
          u1: buildViewerOverride("INFO", { hidden: true }),
        },
      },
      { threadId: "abc", hasQuestion: true }
    );

    expect(getViewerOverride(merged, "u1")?.hidden).toBe(true);
    expect(merged.threadId).toBe("abc");
  });

  it("parses and updates dashboard hidden communication ids", () => {
    expect(parseDashboardHiddenCommunicationIds(["a", "a", 1, "b"])).toEqual([
      "a",
      "b",
    ]);
    expect(addDashboardHiddenCommunicationId(["a"], "b")).toEqual(["a", "b"]);
    expect(removeDashboardHiddenCommunicationId(["a", "b"], "a")).toEqual(["b"]);
  });
});
