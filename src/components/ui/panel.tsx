import type { ReactNode } from "react";

type PanelVariant = "default" | "compact" | "hero";

interface PanelProps {
  title: string;
  count?: number;
  children: ReactNode;
  id?: string;
  variant?: PanelVariant;
  className?: string;
}

export function Panel({
  title,
  count,
  children,
  id,
  variant = "default",
  className,
}: PanelProps) {
  const panelClass =
    variant === "default"
      ? "panel"
      : `panel panel--${variant}`;
  const classes = className ? `${panelClass} ${className}` : panelClass;

  return (
    <section id={id} className={classes}>
      <h2 className="panel__title">
        {title}
        {count !== undefined ? <span className="panel__count">({count})</span> : null}
      </h2>
      <div className="panel__body">{children}</div>
    </section>
  );
}
