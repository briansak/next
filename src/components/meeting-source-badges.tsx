interface MeetingSourceBadgesProps {
  badges: Array<{ kind: string; label: string }>;
}

export function MeetingSourceBadges({ badges }: MeetingSourceBadgesProps) {
  if (badges.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
      {badges.map((badge) => (
        <span
          key={`${badge.kind}-${badge.label}`}
          style={{
            fontSize: "0.65rem",
            fontWeight: 600,
            color: "var(--medium)",
            textTransform: "uppercase",
          }}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}
