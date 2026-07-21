import { describe, expect, it } from "vitest";
import { evaluateStaleSla, partnerAskSlaHours } from "./stale-sla";

describe("evaluateStaleSla", () => {
  it("returns ok within half the SLA window", () => {
    const now = new Date("2026-07-16T12:00:00Z");
    const receivedAt = new Date("2026-07-16T10:00:00Z");
    const sla = evaluateStaleSla(receivedAt, { now, slaHours: 48 });
    expect(sla.severity).toBe("ok");
  });

  it("returns warning after half the SLA window", () => {
    const now = new Date("2026-07-16T12:00:00Z");
    const receivedAt = new Date("2026-07-15T06:00:00Z");
    const sla = evaluateStaleSla(receivedAt, { now, slaHours: 48 });
    expect(sla.severity).toBe("warning");
    expect(sla.label).toMatch(/left$/);
  });

  it("returns critical after SLA expires", () => {
    const now = new Date("2026-07-16T12:00:00Z");
    const receivedAt = new Date("2026-07-13T12:00:00Z");
    const sla = evaluateStaleSla(receivedAt, { now, slaHours: 48 });
    expect(sla.severity).toBe("critical");
  });
});

describe("partnerAskSlaHours", () => {
  it("defaults to 48 hours", () => {
    expect(partnerAskSlaHours()).toBe(48);
  });
});
