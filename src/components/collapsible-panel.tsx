"use client";

import type { ReactNode } from "react";

interface CollapsiblePanelProps {
  title: string;
  count: number;
  children: ReactNode;
  id?: string;
  defaultOpen?: boolean;
}

export function CollapsiblePanel({
  title,
  count,
  children,
  id,
  defaultOpen = false,
}: CollapsiblePanelProps) {
  return (
    <details
      id={id}
      className="collapsible-panel"
      {...(defaultOpen ? { open: true } : {})}
    >
      <summary className="collapsible-panel-summary">
        <span className="collapsible-panel__title">
          {title}
          <span className="collapsible-panel__count">({count})</span>
        </span>
        <span className="collapsible-panel-chevron" aria-hidden>
          ▾
        </span>
      </summary>
      <div className="collapsible-panel__body">{children}</div>
    </details>
  );
}
