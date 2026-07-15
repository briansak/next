export {
  formatDateTime,
  formatFutureDate,
  formatRelativeAge,
  sourceLabel,
} from "@/lib/format/display";

export function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    CRITICAL: "var(--critical)",
    HIGH: "var(--high)",
    MEDIUM: "var(--medium)",
    LOW: "var(--low)",
    INFO: "var(--info)",
  };

  return (
    <span
      style={{
        fontSize: "0.7rem",
        fontWeight: 600,
        color: colors[priority] ?? "var(--info)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {priority}
    </span>
  );
}
