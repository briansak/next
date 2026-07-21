import type { StaleSlaInfo } from "@/lib/heuristics/stale-sla";
import { Chip } from "@/components/ui/chip";

interface StaleSlaBadgeProps {
  sla: StaleSlaInfo;
}

export function StaleSlaBadge({ sla }: StaleSlaBadgeProps) {
  if (sla.severity === "ok" || !sla.label) return null;

  return (
    <Chip
      label={sla.label}
      variant={sla.severity === "critical" ? "critical" : "high"}
    />
  );
}
