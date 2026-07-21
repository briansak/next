import { describe, expect, it } from "vitest";
import {
  envAppConfigDefaults,
  normalizeOllamaBaseUrl,
  parseStoredAppConfig,
  resolveAppConfig,
} from "./app-config";

describe("resolveAppConfig", () => {
  it("falls back to env defaults when nothing is stored", () => {
    const envDefaults = envAppConfigDefaults();
    expect(resolveAppConfig(null)).toEqual(envDefaults);
  });

  it("uses stored values over env defaults", () => {
    const resolved = resolveAppConfig({
      ollamaBaseUrl: "http://127.0.0.1:11434",
      ollamaModel: "qwen2.5:14b",
      enableIngestionPoll: true,
      enableGongEmailCorrelation: false,
      enableMeetingOllamaSummary: true,
      partnerAskSlaHours: 24,
      ingestionPollIntervalMs: 120_000,
    });

    expect(resolved.ollamaBaseUrl).toBe("http://127.0.0.1:11434");
    expect(resolved.ollamaModel).toBe("qwen2.5:14b");
    expect(resolved.enableIngestionPoll).toBe(true);
    expect(resolved.enableGongEmailCorrelation).toBe(false);
    expect(resolved.enableMeetingOllamaSummary).toBe(true);
    expect(resolved.partnerAskSlaHours).toBe(24);
    expect(resolved.ingestionPollIntervalMs).toBe(120_000);
  });

  it("normalizes blank Ollama URL to null", () => {
    const resolved = resolveAppConfig({ ollamaBaseUrl: "   " });
    expect(resolved.ollamaBaseUrl).toBeNull();
  });
});

describe("parseStoredAppConfig", () => {
  it("ignores invalid stored payloads", () => {
    expect(parseStoredAppConfig({ partnerAskSlaHours: "48" })).toEqual({});
    expect(parseStoredAppConfig("invalid")).toEqual({});
  });
});

describe("normalizeOllamaBaseUrl", () => {
  it("strips trailing slashes", () => {
    expect(normalizeOllamaBaseUrl("http://localhost:11434/")).toBe(
      "http://localhost:11434"
    );
  });
});
