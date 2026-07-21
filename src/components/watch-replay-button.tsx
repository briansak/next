interface WatchReplayButtonProps {
  url: string;
  platform?: string | null;
  size?: "sm" | "md";
}

function buttonLabel(platform?: string | null): string {
  if (!platform) return "View replay";
  if (platform === "Cisco" || platform === "SharePoint") return "View on Bridge";
  return `View on ${platform}`;
}

export function WatchReplayButton({
  url,
  platform,
  size = "md",
}: WatchReplayButtonProps) {
  const sizeClass = size === "sm" ? "btn--sm" : "btn--md";

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`btn btn--primary ${sizeClass}`}
    >
      <span aria-hidden style={{ fontSize: "0.95em" }}>
        ▶
      </span>
      {buttonLabel(platform)}
    </a>
  );
}
