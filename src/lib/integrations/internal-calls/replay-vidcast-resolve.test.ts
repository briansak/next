import { afterEach, describe, expect, it, vi } from "vitest";
import {
  followRedirectsToVidcast,
  isMaskedReplayUrl,
  resolveVidcastShareUrl,
} from "./replay-vidcast-resolve";

describe("isMaskedReplayUrl", () => {
  it("detects Cisco campaign bridge links", () => {
    expect(
      isMaskedReplayUrl(
        "https://app.campaignmgr.cisco.com/e/er?s=1865283171&lid=196444&elqTrackId=abc"
      )
    ).toBe(true);
  });

  it("does not treat Vidcast links as masked", () => {
    expect(
      isMaskedReplayUrl("https://app.vidcast.io/share/f91d1f86-a05b-494f-bde1-80cbe120a973")
    ).toBe(false);
  });
});

describe("followRedirectsToVidcast", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("follows redirect hops until a Vidcast share URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.startsWith("https://app.campaignmgr.cisco.com")) {
          return new Response(null, {
            status: 302,
            headers: {
              location:
                "https://s1865283171.t.eloqua.com/e/er?s=1865283171&lid=196444",
            },
          });
        }
        if (url.includes("eloqua.com")) {
          return new Response(null, {
            status: 302,
            headers: {
              location:
                "https://app.vidcast.io/share/f91d1f86-a05b-494f-bde1-80cbe120a973",
            },
          });
        }
        return new Response("<html></html>", { status: 200 });
      })
    );

    const resolved = await followRedirectsToVidcast(
      "https://app.campaignmgr.cisco.com/e/er?s=1865283171&lid=196444"
    );

    expect(resolved).toBe(
      "https://app.vidcast.io/share/f91d1f86-a05b-494f-bde1-80cbe120a973"
    );
  });
});

describe("resolveVidcastShareUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers direct Vidcast links in email text", async () => {
    const resolved = await resolveVidcastShareUrl({
      replayUrl: "https://app.campaignmgr.cisco.com/e/er?s=1",
      text: "Watch https://app.vidcast.io/share/abc123-def4-5678-90ab-cdef12345678",
    });

    expect(resolved).toBe(
      "https://app.vidcast.io/share/abc123-def4-5678-90ab-cdef12345678"
    );
  });

  it("follows masked replay links when no direct Vidcast URL is present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("campaignmgr.cisco.com")) {
          return new Response(null, {
            status: 302,
            headers: {
              location:
                "https://app.vidcast.io/share/f91d1f86-a05b-494f-bde1-80cbe120a973",
            },
          });
        }
        return new Response("<html></html>", { status: 200 });
      })
    );

    const resolved = await resolveVidcastShareUrl({
      replayUrl:
        "https://app.campaignmgr.cisco.com/e/er?s=1865283171&lid=196444&elqTrackId=abc",
      text: "Check out the replay on the Bridge.",
    });

    expect(resolved).toBe(
      "https://app.vidcast.io/share/f91d1f86-a05b-494f-bde1-80cbe120a973"
    );
  });
});
