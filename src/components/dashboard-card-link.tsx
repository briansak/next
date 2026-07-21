import Link from "next/link";
import { priorityAccentClass } from "@/components/ui/chip";

interface DashboardCardLinkProps {
  id: string;
  children: React.ReactNode;
  highlighted?: boolean;
  priority?: string;
  /** Rendered outside the card link (e.g. external recording URLs). */
  footer?: React.ReactNode;
  showLinkHint?: boolean;
}

function cardClass(highlighted: boolean, priority?: string): string {
  const classes = ["card"];
  if (highlighted) classes.push("card--highlighted");
  const accentClass = priority ? priorityAccentClass(priority) : null;
  if (accentClass) classes.push(accentClass);
  return classes.join(" ");
}

export function DashboardCardLink({
  id,
  children,
  highlighted = false,
  priority,
  footer,
  showLinkHint = false,
}: DashboardCardLinkProps) {
  return (
    <div className={cardClass(highlighted, priority)}>
      <Link
        href={`/dashboard/${id}`}
        className={footer ? "card__link card__link--with-footer" : "card__link"}
      >
        {children}
        {showLinkHint ? (
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
        ) : null}
      </Link>
      {footer ? <div className="card__footer">{footer}</div> : null}
    </div>
  );
}

interface DashboardPlanningCardLinkProps {
  id: string;
  children: React.ReactNode;
  priority?: string;
  showLinkHint?: boolean;
}

export function DashboardPlanningCardLink({
  id,
  children,
  priority,
  showLinkHint = false,
}: DashboardPlanningCardLinkProps) {
  const classes = ["card", priority ? priorityAccentClass(priority) : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <Link
      href={`/dashboard/${id}`}
      className={classes}
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
        padding: "var(--space-3)",
        paddingBottom: "var(--space-2)",
      }}
    >
      {children}
      {showLinkHint ? (
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
      ) : null}
    </Link>
  );
}
