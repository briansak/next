interface CardAiSummaryProps {
  text?: string | null;
  label?: string | null;
}

export function CardAiSummary({ text, label }: CardAiSummaryProps) {
  if (!text?.trim()) return null;

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
      <p
        style={{
          fontSize: "0.85rem",
          color: "var(--text-muted)",
          lineHeight: 1.5,
          marginTop: label ? "0.2rem" : 0,
        }}
      >
        {text}
      </p>
    </div>
  );
}
