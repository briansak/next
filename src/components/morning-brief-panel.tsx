import Link from "next/link";
import type { MorningBrief } from "@/lib/heuristics/morning-brief";

interface MorningBriefPanelProps {
  brief: MorningBrief;
}

export function MorningBriefPanel({ brief }: MorningBriefPanelProps) {
  return (
    <section className="panel panel--hero">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "var(--space-3)",
          marginBottom: "var(--space-3)",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 className="page__title" style={{ fontSize: "var(--text-base)", marginBottom: "var(--space-1)" }}>
            {brief.greeting}
          </h2>
          <p className="text-muted text-sm" style={{ margin: 0, lineHeight: 1.5 }}>
            {brief.summaryLine}
          </p>
        </div>
        <span className="text-xs text-muted" style={{ alignSelf: "start" }}>
          Morning brief
        </span>
      </div>

      {brief.priorities.length > 0 ? (
        <ol className="brief-priority-list">
          {brief.priorities.map((item, index) => (
            <li key={item.id}>
              <Link href={item.href as `/dashboard/${string}`} className="brief-priority-card">
                <p className="brief-priority-card__headline">
                  {index + 1}. {item.headline}
                </p>
                <p className="brief-priority-card__detail">{item.detail}</p>
              </Link>
            </li>
          ))}
        </ol>
      ) : null}

      {brief.upcomingMeetings.length > 0 ? (
        <div className="text-sm text-muted" style={{ lineHeight: 1.6 }}>
          <strong style={{ color: "var(--text)" }}>Coming up:</strong>{" "}
          {brief.upcomingMeetings
            .map((meeting) => `${meeting.label} — ${meeting.subject ?? "Meeting"}`)
            .join(" · ")}
        </div>
      ) : null}
    </section>
  );
}
