import { describe, expect, it } from "vitest";
import {
  buildHeuristicDashboardSummary,
  pickExistingDashboardSummary,
  type DashboardSummaryItem,
} from "./dashboard-summary";

function item(overrides: Partial<DashboardSummaryItem>): DashboardSummaryItem {
  return {
    id: "c1",
    source: "EMAIL",
    subject: "Partner sync",
    body: "When can we schedule the onsite visit? Please confirm by Friday.",
    excerpt: null,
    summary: null,
    authorName: "Jane",
    metadata: {},
    ...overrides,
  };
}

describe("pickExistingDashboardSummary", () => {
  it("returns cached dashboard summaries", () => {
    const summary = pickExistingDashboardSummary(
      item({
        metadata: {
          dashboardSummaryText: "Jane asked to schedule an onsite visit.",
          dashboardSummarySource: "ollama",
        },
      })
    );

    expect(summary?.text).toContain("onsite visit");
    expect(summary?.source).toBe("ollama");
    expect(summary?.fromCache).toBe(true);
  });

  it("returns Gong meeting summaries", () => {
    const summary = pickExistingDashboardSummary(
      item({
        source: "WEBEX_MEETING",
        metadata: {
          gongSummaryText: "Discussed Q3 pipeline and partner expansion.",
        },
      })
    );

    expect(summary?.source).toBe("gong");
    expect(summary?.text).toContain("Q3 pipeline");
  });

  it("prefers Gong summaries over cached dashboard summaries", () => {
    const summary = pickExistingDashboardSummary(
      item({
        source: "WEBEX_MEETING",
        metadata: {
          gongSummaryText: "Discussed Q3 pipeline and partner expansion.",
          dashboardSummaryText: "Generic cached meeting recap.",
          dashboardSummarySource: "ollama",
        },
      })
    );

    expect(summary?.source).toBe("gong");
    expect(summary?.text).toContain("Q3 pipeline");
  });
});

describe("buildHeuristicDashboardSummary", () => {
  it("builds a readable fallback from subject and body", () => {
    const summary = buildHeuristicDashboardSummary(item({}));

    expect(summary.text).toContain("Partner sync");
    expect(summary.text).toContain("onsite visit");
    expect(summary.source).toBe("heuristic");
  });
});
