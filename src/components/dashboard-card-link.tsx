import Link from "next/link";

interface DashboardCardLinkProps {
  id: string;
  children: React.ReactNode;
  highlighted?: boolean;
}

export function DashboardCardLink({
  id,
  children,
  highlighted = false,
}: DashboardCardLinkProps) {
  return (
    <Link
      href={`/dashboard/${id}`}
      className="dashboard-card-link"
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
        padding: "0.75rem",
        background: highlighted ? "rgba(91, 143, 239, 0.08)" : "var(--bg)",
        borderRadius: 8,
        border: highlighted ? "1px solid var(--accent)" : "1px solid var(--border)",
      }}
    >
      {children}
      <span
        style={{
          display: "inline-block",
          marginTop: "0.5rem",
          fontSize: "0.72rem",
          color: "var(--accent)",
          fontWeight: 500,
        }}
      >
        View full content →
      </span>
    </Link>
  );
}

interface DashboardPlanningCardLinkProps {
  id: string;
  children: React.ReactNode;
}

export function DashboardPlanningCardLink({
  id,
  children,
}: DashboardPlanningCardLinkProps) {
  return (
    <Link
      href={`/dashboard/${id}`}
      className="dashboard-card-link"
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
        padding: "0.75rem",
        paddingBottom: "0.5rem",
      }}
    >
      {children}
      <span
        style={{
          display: "inline-block",
          marginTop: "0.5rem",
          fontSize: "0.72rem",
          color: "var(--accent)",
          fontWeight: 500,
        }}
      >
        View full event →
      </span>
    </Link>
  );
}
