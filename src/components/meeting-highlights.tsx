import type { CallHighlight } from "@/lib/heuristics/ollama-vision";

interface MeetingHighlightsProps {
  highlights: CallHighlight[];
  recordingHref?: string | null;
}

function highlightHref(recordingHref: string, startSeconds: number): string {
  const separator = recordingHref.includes("?") ? "&" : "?";
  return `${recordingHref}${separator}t=${startSeconds}`;
}

export function MeetingHighlights({
  highlights,
  recordingHref,
}: MeetingHighlightsProps) {
  if (highlights.length === 0) return null;

  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "1.25rem",
        marginBottom: "1.25rem",
      }}
    >
      <h2 style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.75rem" }}>
        Highlights
      </h2>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: "0.85rem",
        }}
      >
        {highlights.map((item) => {
          const href =
            recordingHref && item.startSeconds >= 0
              ? highlightHref(recordingHref, item.startSeconds)
              : null;

          return (
            <li
              key={`${item.startSeconds}-${item.title}`}
              style={{
                borderLeft: "2px solid var(--accent)",
                paddingLeft: "0.75rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  alignItems: "baseline",
                  marginBottom: "0.25rem",
                }}
              >
                <p style={{ fontWeight: 600, fontSize: "0.875rem", margin: 0 }}>
                  {item.title}
                </p>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--accent)",
                      whiteSpace: "nowrap",
                      textDecoration: "none",
                    }}
                  >
                    {item.timestamp} →
                  </a>
                ) : (
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.timestamp}
                  </span>
                )}
              </div>
              <p
                style={{
                  fontSize: "0.85rem",
                  lineHeight: 1.5,
                  color: "var(--text-muted)",
                  margin: 0,
                }}
              >
                {item.description}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
