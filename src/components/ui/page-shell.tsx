import type { ReactNode } from "react";

interface PageShellProps {
  title?: string;
  description?: string;
  children: ReactNode;
  width?: "default" | "wide";
}

export function PageShell({
  title,
  description,
  children,
  width = "default",
}: PageShellProps) {
  const pageClass = width === "wide" ? "page page--wide" : "page";

  return (
    <main className={pageClass}>
      {title || description ? (
        <header className="page__header">
          {title ? <h1 className="page__title">{title}</h1> : null}
          {description ? <p className="page__description">{description}</p> : null}
        </header>
      ) : null}
      {children}
    </main>
  );
}

export function PageSection({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const classes = className ? `page-section ${className}` : "page-section";
  return <section className={classes}>{children}</section>;
}
