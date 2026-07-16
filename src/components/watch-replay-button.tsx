interface WatchReplayButtonProps {
  url: string;
  platform?: string | null;
  size?: "sm" | "md";
}

function buttonLabel(platform?: string | null): string {
  if (!platform) return "Watch Replay";
  return `Watch on ${platform}`;
}

export function WatchReplayButton({
  url,
  platform,
  size = "md",
}: WatchReplayButtonProps) {
  const padding = size === "sm" ? "0.3rem 0.65rem" : "0.45rem 0.9rem";
  const fontSize = size === "sm" ? "0.78rem" : "0.85rem";

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        fontSize,
        color: "#fff",
        background: "var(--accent)",
        fontWeight: 600,
        textDecoration: "none",
        padding,
        borderRadius: 8,
        lineHeight: 1.2,
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden style={{ fontSize: "0.95em" }}>
        ▶
      </span>
      {buttonLabel(platform)}
    </a>
  );
}
