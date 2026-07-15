export function formatRelativeAge(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function formatFutureDate(date: Date): string {
  const days = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (days <= 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  if (days < 7) return `${date.toLocaleDateString([], { weekday: "short" })} ${time}`;
  return `${date.toLocaleDateString()} ${time}`;
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function sourceLabel(source: string): string {
  switch (source) {
    case "EMAIL":
      return "Email";
    case "WEBEX":
      return "Webex message";
    case "WEBEX_MEETING":
      return "Meeting";
    case "OUTLOOK_CALENDAR":
      return "Calendar event";
    default:
      return source;
  }
}

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
