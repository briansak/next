import {
  formatGongSummaryForDisplay,
  gongSummaryHasStructuredContent,
  type GongSummaryDisplay,
} from "@/lib/integrations/gong/display";
import { fixMojibake } from "@/lib/integrations/email/body-text";

interface CardAiSummaryProps {
  text?: string | null;
  label?: string | null;
  source?: string | null;
  maxBullets?: number;
  variant?: "full" | "teaser";
  /** Show every parsed takeaway with no "+N more" truncation. */
  showAllTakeaways?: boolean;
}

function GongSummaryContent({
  display,
  maxBullets,
  hideRemaining = false,
}: {
  display: GongSummaryDisplay;
  maxBullets: number;
  hideRemaining?: boolean;
}) {
  const visible = display.takeaways.slice(0, maxBullets);
  const remaining = hideRemaining ? 0 : display.takeaways.length - visible.length;

  return (
    <>
      {display.overview ? (
        <p
          style={{
            fontSize: "0.85rem",
            color: "var(--text-muted)",
            lineHeight: 1.5,
            marginTop: 0,
          }}
        >
          {display.overview}
        </p>
      ) : null}
      {visible.length > 0 ? (
        <ul
          style={{
            marginTop: display.overview ? "0.45rem" : 0,
            marginBottom: 0,
            paddingLeft: "1.1rem",
            fontSize: "0.85rem",
            color: "var(--text-muted)",
            lineHeight: 1.5,
          }}
        >
          {visible.map((item) => (
            <li key={item} style={{ marginBottom: "0.2rem" }}>
              {item}
            </li>
          ))}
        </ul>
      ) : null}
      {remaining > 0 ? (
        <p
          style={{
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            marginTop: "0.35rem",
            marginBottom: 0,
          }}
        >
          +{remaining} more takeaway{remaining === 1 ? "" : "s"}
        </p>
      ) : null}
    </>
  );
}

function teaserLine(text: string, maxLength = 140): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLength) return oneLine;
  return `${oneLine.slice(0, maxLength - 1).trim()}…`;
}

function resolveTeaserText(text: string): string {
  const normalized = fixMojibake(text.trim());
  const display = formatGongSummaryForDisplay(normalized);
  if (display.overview?.trim()) {
    return teaserLine(display.overview);
  }
  if (display.takeaways[0]) {
    return teaserLine(display.takeaways[0]);
  }
  return teaserLine(normalized);
}

export function CardAiSummary({
  text,
  label,
  source,
  maxBullets = 4,
  variant = "full",
  showAllTakeaways = false,
}: CardAiSummaryProps) {
  const trimmed = text?.trim();
  if (!trimmed) return null;

  const normalized = fixMojibake(trimmed);

  if (variant === "teaser") {
    return (
      <p
        className="line-clamp-2"
        style={{
          fontSize: "0.85rem",
          color: "var(--text-muted)",
          lineHeight: 1.5,
          marginTop: "0.35rem",
          marginBottom: 0,
        }}
      >
        {resolveTeaserText(normalized)}
      </p>
    );
  }

  const display = formatGongSummaryForDisplay(normalized, {
    maxTakeaways: showAllTakeaways ? 24 : 12,
  });
  const showStructured =
    gongSummaryHasStructuredContent(display) &&
    (display.takeaways.length >= 2 || normalized.length > 220);
  const visibleBullets = showAllTakeaways
    ? display.takeaways.length
    : maxBullets;

  return (
    <div style={{ marginTop: "0.35rem" }}>
      {label ? (
        <span
          style={{
            fontSize: "0.65rem",
            fontWeight: 600,
            color: "var(--low)",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
      ) : null}
      {showStructured ? (
        <div style={{ marginTop: label ? "0.35rem" : 0 }}>
          <GongSummaryContent
            display={display}
            maxBullets={visibleBullets}
            hideRemaining={showAllTakeaways}
          />
        </div>
      ) : (
        <p
          style={{
            fontSize: "0.85rem",
            color: "var(--text-muted)",
            lineHeight: 1.5,
            marginTop: label ? "0.2rem" : 0,
            whiteSpace: "pre-wrap",
          }}
        >
          {normalized}
        </p>
      )}
    </div>
  );
}

export function GongMeetingSummary({
  text,
  actionItems,
}: {
  text: string;
  actionItems?: string[];
}) {
  const trimmed = text.trim();
  const display = formatGongSummaryForDisplay(trimmed, { maxTakeaways: 12 });
  const items = actionItems?.filter(Boolean) ?? [];
  const showStructured = gongSummaryHasStructuredContent(display);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
      {showStructured ? (
        <GongSummaryContent display={display} maxBullets={12} />
      ) : (
        <p style={{ fontSize: "0.875rem", lineHeight: 1.6, color: "var(--text-muted)", margin: 0 }}>
          {trimmed}
        </p>
      )}
      {items.length > 0 ? (
        <div>
          <h3
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--text)",
              marginBottom: "0.35rem",
            }}
          >
            Action items
          </h3>
          <ul
            style={{
              paddingLeft: "1.1rem",
              fontSize: "0.85rem",
              color: "var(--text-muted)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
