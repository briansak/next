import { describe, expect, it } from "vitest";

function ingestionPollEnabled(): boolean {
  return process.env.ENABLE_INGESTION_POLL === "true";
}

function ingestionPollIntervalMs(): number {
  const configured = Number(process.env.INGESTION_POLL_INTERVAL_MS ?? "300000");
  return Number.isFinite(configured) && configured >= 60_000
    ? configured
    : 300_000;
}

describe("ingestion poll config", () => {
  it("is disabled by default", () => {
    const prev = process.env.ENABLE_INGESTION_POLL;
    delete process.env.ENABLE_INGESTION_POLL;
    expect(ingestionPollEnabled()).toBe(false);
    process.env.ENABLE_INGESTION_POLL = prev;
  });

  it("defaults interval to 5 minutes", () => {
    const prev = process.env.INGESTION_POLL_INTERVAL_MS;
    delete process.env.INGESTION_POLL_INTERVAL_MS;
    expect(ingestionPollIntervalMs()).toBe(300_000);
    process.env.INGESTION_POLL_INTERVAL_MS = prev;
  });

  it("enforces a minimum interval of 60 seconds", () => {
    const prev = process.env.INGESTION_POLL_INTERVAL_MS;
    process.env.INGESTION_POLL_INTERVAL_MS = "1000";
    expect(ingestionPollIntervalMs()).toBe(300_000);
    process.env.INGESTION_POLL_INTERVAL_MS = prev;
  });
});
