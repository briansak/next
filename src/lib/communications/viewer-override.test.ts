import { describe, expect, it } from "vitest";
import {
  applyViewerPriorityOverride,
  buildViewerOverride,
  getViewerOverride,
  mergeViewerOverrideMetadata,
  priorityToScore,
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
});
