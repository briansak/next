import type { CSSProperties } from "react";
import { meetingRecordingHref } from "@/lib/integrations/webex/meetings";

interface MeetingRecordingLinksProps {
  metadata: {
    recordingDownloadUrl?: string;
    recordingPlaybackUrl?: string;
    replayUrl?: string;
    gongReplayUrl?: string;
    webLink?: string;
    hasRecording?: boolean;
  };
  size?: "sm" | "md";
}

const linkStyle = (size: "sm" | "md"): CSSProperties => ({
  fontSize: size === "sm" ? "0.78rem" : "0.85rem",
  color: "var(--accent)",
  fontWeight: 600,
  textDecoration: "none",
});

export function MeetingRecordingLinks({
  metadata,
  size = "md",
}: MeetingRecordingLinksProps) {
  const recordingHref = meetingRecordingHref(metadata);
  const style = linkStyle(size);

  return (
    <>
          {recordingHref ? (
        <a
          href={recordingHref}
          target="_blank"
          rel="noopener noreferrer"
          style={style}
        >
          {metadata.recordingDownloadUrl || metadata.recordingPlaybackUrl
            ? metadata.recordingDownloadUrl
              ? "Open recording"
              : "Watch in Webex"
            : metadata.replayUrl || metadata.gongReplayUrl
              ? "Open replay"
              : "Watch in Webex"}
        </a>
      ) : null}
      {metadata.webLink && metadata.webLink !== recordingHref ? (
        <a
          href={metadata.webLink}
          target="_blank"
          rel="noopener noreferrer"
          style={style}
        >
          Open in Webex
        </a>
      ) : null}
    </>
  );
}
