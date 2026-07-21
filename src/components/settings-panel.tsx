export function SettingsPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "1.5rem",
      }}
    >
      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: "var(--text-muted)",
    ACTIVE: "var(--low)",
    PAUSED: "var(--high)",
  };

  return (
    <span
      style={{
        fontSize: "0.7rem",
        fontWeight: 600,
        color: colors[status] ?? "var(--text-muted)",
        textTransform: "uppercase",
      }}
    >
      {status}
    </span>
  );
}
