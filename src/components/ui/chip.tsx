import type { ReactNode } from "react";

export type ChipVariant =
  | "default"
  | "accent"
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "info"
  | "priority";

interface ChipProps {
  label: string;
  variant?: ChipVariant;
  className?: string;
}

function chipClass(variant: ChipVariant, className?: string): string {
  const base = variant === "priority" ? "chip chip--priority" : `chip chip--${variant}`;
  return className ? `${base} ${className}` : base;
}

export function Chip({ label, variant = "default", className }: ChipProps) {
  return <span className={chipClass(variant, className)}>{label}</span>;
}

export function priorityChipVariant(priority: string): ChipVariant {
  switch (priority) {
    case "CRITICAL":
      return "critical";
    case "HIGH":
      return "high";
    case "MEDIUM":
      return "medium";
    case "LOW":
      return "low";
    default:
      return "info";
  }
}

export function priorityAccentClass(priority: string): string | null {
  if (priority === "CRITICAL") return "card--priority-critical";
  if (priority === "HIGH") return "card--priority-high";
  return null;
}

export function priorityAccentColor(priority: string): string | null {
  if (priority === "CRITICAL") return "var(--critical)";
  if (priority === "HIGH") return "var(--high)";
  return null;
}
