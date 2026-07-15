export interface MeetingPerson {
  email?: string;
  displayName?: string;
  response?: string;
}

export interface MeetingParticipantsProps {
  participants?: MeetingPerson[];
  invitees?: MeetingPerson[];
  /** Legacy email-only fields from older syncs */
  participantEmails?: string[];
  inviteeEmails?: string[];
}

function normalizePeople(
  people: MeetingPerson[] | undefined,
  emails: string[] | undefined
): MeetingPerson[] {
  if (people?.length) return people;
  return (emails ?? []).map((email) => ({ email }));
}

function personLabel(person: MeetingPerson): string {
  if (person.displayName && person.email) {
    return `${person.displayName} (${person.email})`;
  }
  return person.displayName ?? person.email ?? "Unknown";
}

function personKey(person: MeetingPerson, index: number): string {
  return person.email ?? person.displayName ?? `person-${index}`;
}

function formatResponse(response?: string): string | null {
  if (!response) return null;
  const normalized = response.toLowerCase();
  if (normalized === "accepted") return "Accepted";
  if (normalized === "declined") return "Declined";
  if (normalized === "tentative") return "Tentative";
  return response;
}

export function MeetingParticipants({
  participants,
  invitees,
  participantEmails,
  inviteeEmails,
}: MeetingParticipantsProps) {
  const attended = normalizePeople(participants, participantEmails);
  const invited = normalizePeople(invitees, inviteeEmails);

  const attendedEmails = new Set(
    attended.map((p) => p.email?.toLowerCase()).filter(Boolean) as string[]
  );
  const invitedOnly = invited.filter(
    (p) => p.email && !attendedEmails.has(p.email.toLowerCase())
  );

  const hasAttended = attended.length > 0;
  const hasInvitedOnly = invitedOnly.length > 0;
  const fallbackInvitees = !hasAttended && invited.length > 0;

  if (!hasAttended && !fallbackInvitees && !hasInvitedOnly) {
    return null;
  }

  const summaryLabel = hasAttended
    ? `Participants (${attended.length})`
    : `Invitees (${invited.length})`;

  return (
    <details
      style={{
        marginTop: "0.5rem",
        fontSize: "0.8rem",
        color: "var(--text-muted)",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          fontWeight: 500,
          color: "var(--text-muted)",
          listStylePosition: "inside",
        }}
      >
        {summaryLabel}
        {hasAttended && hasInvitedOnly
          ? ` · ${invitedOnly.length} invited, did not attend`
          : ""}
      </summary>

      <div style={{ marginTop: "0.35rem", paddingLeft: "0.25rem" }}>
        {hasAttended && (
          <ParticipantList people={attended} />
        )}

        {fallbackInvitees && (
          <ParticipantList people={invited} showResponse />
        )}

        {hasAttended && hasInvitedOnly && (
          <>
            <p
              style={{
                margin: "0.5rem 0 0.25rem",
                fontSize: "0.7rem",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--text-muted)",
              }}
            >
              Invited, did not attend
            </p>
            <ParticipantList people={invitedOnly} showResponse />
          </>
        )}
      </div>
    </details>
  );
}

function ParticipantList({
  people,
  showResponse = false,
}: {
  people: MeetingPerson[];
  showResponse?: boolean;
}) {
  return (
    <ul
      style={{
        margin: 0,
        paddingLeft: "1.1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.2rem",
      }}
    >
      {people.map((person, index) => {
        const response = showResponse ? formatResponse(person.response) : null;
        return (
          <li key={personKey(person, index)}>
            {personLabel(person)}
            {response ? ` · ${response}` : ""}
          </li>
        );
      })}
    </ul>
  );
}
