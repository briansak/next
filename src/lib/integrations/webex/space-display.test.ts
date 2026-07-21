import { describe, expect, it } from "vitest";
import {
  dedupeSpacesById,
  filterSpacesByQuery,
  spaceListSubtitle,
} from "./space-display";

describe("dedupeSpacesById", () => {
  it("removes duplicate room IDs from paginated results", () => {
    const spaces = dedupeSpacesById([
      {
        id: "room-1",
        title: "WWT Security",
        type: "group",
        lastActivity: "2026-07-10T12:00:00Z",
      },
      {
        id: "room-1",
        title: "WWT Security",
        type: "group",
        lastActivity: "2026-07-15T12:00:00Z",
      },
      {
        id: "room-2",
        title: "WWT Security",
        type: "group",
        lastActivity: "2026-07-14T12:00:00Z",
      },
    ]);

    expect(spaces).toHaveLength(2);
    expect(spaces.find((space) => space.id === "room-1")?.lastActivity).toBe(
      "2026-07-15T12:00:00Z"
    );
  });
});

describe("filterSpacesByQuery", () => {
  it("filters case-insensitively by title", () => {
    const spaces = filterSpacesByQuery(
      [
        { id: "1", title: "Alpha Team", type: "group" },
        { id: "2", title: "Beta Group", type: "group" },
      ],
      "alpha"
    );

    expect(spaces).toHaveLength(1);
    expect(spaces[0]?.id).toBe("1");
  });
});

describe("spaceListSubtitle", () => {
  it("adds id suffix when titles collide", () => {
    const all = [
      { id: "aaa111", title: "Partner Sync", type: "group" },
      { id: "bbb222", title: "Partner Sync", type: "group" },
    ];

    expect(spaceListSubtitle(all[0]!, all)).toContain("…aaa111");
    expect(spaceListSubtitle(all[1]!, all)).toContain("…bbb222");
  });
});
