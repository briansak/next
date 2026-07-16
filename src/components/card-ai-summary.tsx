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
}

function GongSummaryContent({
  display,
  maxBullets,
}: {
  display: GongSummaryDisplay;
  maxBullets: number;
}) {
  const visible = display.takeaways.slice(0, maxBullets);
  const remaining = display.takeaways.length - visible.length;

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

export function CardAiSummary({
  text,
  label,
  source,
  maxBullets = 4,
}: CardAiSummaryProps) {
  const trimmed = text?.trim();
  if (!trimmed) return null;

  const normalized = fixMojibake(trimmed);
  const display = formatGongSummaryForDisplay(normalized);
  const showStructured =
    gongSummaryHasStructuredContent(display) &&
    (display.takeaways.length >= 2 || normalized.length > 220);

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
          <GongSummaryContent display={display} maxBullets={maxBullets} />
        </div>
      ) : (
        <p
          style={{
            fontSize: "0.85rem",
            color: "var(--text-muted)",
            lineHeight: 1.5,
            marginTop: label ? "0.2rem" : 0,
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
