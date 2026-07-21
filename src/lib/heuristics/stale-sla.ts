export type SlaSeverity = "ok" | "warning" | "critical";

export interface StaleSlaInfo {
  severity: SlaSeverity;
  label: string;
  hoursOpen: number;
  slaHours: number;
}

const DEFAULT_PARTNER_ASK_SLA_HOURS = 48;
const WARNING_RATIO = 0.5;

export function partnerAskSlaHours(): number {
  const raw = process.env.PARTNER_ASK_SLA_HOURS?.trim();
  if (!raw) return DEFAULT_PARTNER_ASK_SLA_HOURS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PARTNER_ASK_SLA_HOURS;
}

export function hoursSince(date: Date, now = new Date()): number {
  return Math.max(0, (now.getTime() - date.getTime()) / (1000 * 60 * 60));
}

export function evaluateStaleSla(
  receivedAt: Date,
  options?: { slaHours?: number; now?: Date }
): StaleSlaInfo {
  const now = options?.now ?? new Date();
  const slaHours = options?.slaHours ?? partnerAskSlaHours();
  const hoursOpen = hoursSince(receivedAt, now);
  const warningThreshold = slaHours * WARNING_RATIO;

  if (hoursOpen >= slaHours) {
    const days = Math.floor(hoursOpen / 24);
    return {
      severity: "critical",
      label: days >= 1 ? `${days}d overdue` : "Overdue",
      hoursOpen,
      slaHours,
    };
  }

  if (hoursOpen >= warningThreshold) {
    const hoursLeft = Math.max(1, Math.ceil(slaHours - hoursOpen));
    return {
      severity: "warning",
      label: `${hoursLeft}h left`,
      hoursOpen,
      slaHours,
    };
  }

  return {
    severity: "ok",
    label: "",
    hoursOpen,
    slaHours,
  };
}

export function isStalePartnerAsk(receivedAt: Date, now = new Date()): boolean {
  return evaluateStaleSla(receivedAt, { now }).severity !== "ok";
}
