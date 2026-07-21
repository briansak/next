export {
  formatDateTime,
  formatFutureDate,
  formatRelativeAge,
  sourceLabel,
} from "@/lib/format/display";

export {
  Chip,
  priorityAccentClass,
  priorityAccentColor,
  priorityChipVariant,
  type ChipVariant,
} from "@/components/ui/chip";

import { Chip, priorityChipVariant } from "@/components/ui/chip";

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`chip chip--priority chip--${priorityChipVariant(priority)}`}>
      {priority}
    </span>
  );
}

export function AttentionChip({ label = "Needs your reply" }: { label?: string }) {
  return <Chip label={label} variant="accent" />;
}

export function MetaChip({
  label,
  variant = "default",
}: {
  label: string;
  variant?: "default" | "accent" | "critical" | "high" | "medium" | "low" | "info";
}) {
  return <Chip label={label} variant={variant} />;
}
