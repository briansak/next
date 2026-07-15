/**
 * Webex Meetings REST API — schedules, summaries, recordings, transcripts.
 * Requires meeting:* scopes on the integration OAuth grant.
 */

const WEBEX_API = "https://webexapis.com/v1";

/** How far back meeting sync and the dashboard look (days). */
export const MEETING_LOOKBACK_DAYS = 14;

export interface WebexMeeting {
  id: string;
  title: string;
  meetingType: string;
  state?: string;
  start: string;
  end?: string;
  hostEmail?: string;
  hostDisplayName?: string;
  webLink?: string;
  hasRecording?: boolean;
  hasSummary?: boolean;
  hasTranscription?: boolean;
  meetingSeriesId?: string;
  scheduledMeetingId?: string;
}

export interface WebexMeetingInvitee {
  email: string;
  displayName?: string;
  response?: string;
}

export interface WebexMeetingSummary {
  id: string;
  meetingId: string;
  note?: string;
  actionItems?: Array<{ text?: string; assignee?: string } | string>;
}

export interface WebexRecording {
  id: string;
  meetingId?: string;
  meetingSeriesId?: string;
  topic?: string;
  createTime?: string;
  downloadUrl?: string;
  playbackUrl?: string;
  temporaryDirectDownloadLinks?: {
    recordingDownloadLink?: string;
    audioDownloadLink?: string;
  };
}

export interface WebexMeetingTranscript {
  id: string;
  meetingId: string;
  txtDownloadLink?: string;
  vttDownloadLink?: string;
}

export interface WebexMeetingParticipant {
  email?: string;
  displayName?: string;
  joinedTime?: string;
  leftTime?: string;
}

export interface MeetingEnrichment {
  summary?: WebexMeetingSummary;
  recordings: WebexRecording[];
  transcripts: WebexMeetingTranscript[];
  invitees: WebexMeetingInvitee[];
  participants: WebexMeetingParticipant[];
}

async function webexGet<T>(
  accessToken: string,
  path: string,
  params?: Record<string, string>
): Promise<T | null> {
  const url = new URL(`${WEBEX_API}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Webex ${path} failed: ${response.status} ${body}`);
  }

  return (await response.json()) as T;
}

export function daysAgoIso(days: number = MEETING_LOOKBACK_DAYS): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export async function getWebexConnectorEmails(
  accessToken: string
): Promise<string[]> {
  try {
    const data = await webexGet<{
      emails?: string[];
      email?: string;
    }>(accessToken, "/people/me");

    if (!data) return [];

    const emails: string[] = [];
    if (data.email) emails.push(data.email);
    if (data.emails) emails.push(...data.emails);
    return [...new Set(emails.map((e) => e.toLowerCase()))];
  } catch {
    // spark:people_read may be missing on older tokens — meeting sync still works
    return [];
  }
}

/** List meeting instances in a date window for the token holder (or hostEmail). */
export async function listRecentMeetings(
  accessToken: string,
  options?: { from?: string; to?: string; hostEmail?: string; max?: number }
): Promise<WebexMeeting[]> {
  const data = await webexGet<{ items: WebexMeeting[] }>(
    accessToken,
    "/meetings",
    {
      from: options?.from ?? daysAgoIso(),
      to: options?.to ?? new Date().toISOString(),
      max: String(options?.max ?? 100),
      // Required — without this Webex returns meetingSeries, not ended instances
      meetingType: "meeting",
      ...(options?.hostEmail ? { hostEmail: options.hostEmail } : {}),
    }
  );

  return data?.items ?? [];
}

export interface MeetingWithContext {
  meeting: WebexMeeting;
  /** Tenant member emails this meeting was fetched for */
  attributedToEmails: string[];
}

export async function listMeetingInvitees(
  accessToken: string,
  meetingId: string
): Promise<WebexMeetingInvitee[]> {
  const data = await webexGet<{ items: WebexMeetingInvitee[] }>(
    accessToken,
    "/meetingInvitees",
    { meetingId, max: "100" }
  );
  return data?.items ?? [];
}

export async function listMeetingParticipants(
  accessToken: string,
  meetingId: string
): Promise<WebexMeetingParticipant[]> {
  const data = await webexGet<{ items: WebexMeetingParticipant[] }>(
    accessToken,
    "/meetingParticipants",
    { meetingId, max: "100" }
  );
  return data?.items ?? [];
}

export async function getMeetingSummaries(
  accessToken: string,
  meetingId: string
): Promise<WebexMeetingSummary[]> {
  const paths = [
    `/meetingSummaries?meetingId=${encodeURIComponent(meetingId)}`,
    `/meeting/summaries?meetingId=${encodeURIComponent(meetingId)}`,
  ];

  for (const path of paths) {
    const [base, query] = path.split("?");
    const params = Object.fromEntries(new URLSearchParams(query));
    const data = await webexGet<{ items: WebexMeetingSummary[] }>(
      accessToken,
      base,
      params
    );
    if (data?.items?.length) return data.items;
  }

  return [];
}

export async function listMeetingRecordings(
  accessToken: string,
  meetingId: string,
  from?: string,
  to?: string
): Promise<WebexRecording[]> {
  const data = await webexGet<{ items: WebexRecording[] }>(
    accessToken,
    "/recordings",
    {
      from: from ?? daysAgoIso(),
      to: to ?? new Date().toISOString(),
      max: "50",
    }
  );

  return (data?.items ?? []).filter(
    (r) => !r.meetingId || r.meetingId === meetingId
  );
}

export async function getRecordingDetails(
  accessToken: string,
  recordingId: string
): Promise<WebexRecording | null> {
  return webexGet<WebexRecording>(accessToken, `/recordings/${recordingId}`);
}

export async function listMeetingTranscripts(
  accessToken: string,
  meetingId: string
): Promise<WebexMeetingTranscript[]> {
  const data = await webexGet<{ items: WebexMeetingTranscript[] }>(
    accessToken,
    "/meetingTranscripts",
    { meetingId, max: "10" }
  );
  return data?.items ?? [];
}

export async function enrichMeeting(
  accessToken: string,
  meeting: WebexMeeting
): Promise<MeetingEnrichment> {
  const [invitees, participants, summaries, recordings, transcripts] =
    await Promise.all([
      listMeetingInvitees(accessToken, meeting.id).catch(() => []),
      listMeetingParticipants(accessToken, meeting.id).catch(() => []),
      getMeetingSummaries(accessToken, meeting.id).catch(() => []),
      listMeetingRecordings(accessToken, meeting.id).catch(() => []),
      listMeetingTranscripts(accessToken, meeting.id).catch(() => []),
    ]);

  let detailedRecordings = recordings;
  if (recordings.length > 0) {
    const withLinks = await Promise.all(
      recordings.slice(0, 3).map(async (r) => {
        const detail = await getRecordingDetails(accessToken, r.id).catch(
          () => null
        );
        return detail ?? r;
      })
    );
    detailedRecordings = withLinks;
  }

  return {
    summary: summaries[0],
    recordings: detailedRecordings,
    transcripts,
    invitees,
    participants,
  };
}

export function collectEmails(
  meeting: WebexMeeting,
  enrichment: MeetingEnrichment
): string[] {
  const emails = new Set<string>();
  const add = (e?: string | null) => {
    if (e) emails.add(e.toLowerCase());
  };

  add(meeting.hostEmail);
  for (const inv of enrichment.invitees) add(inv.email);
  for (const p of enrichment.participants) add(p.email);

  return [...emails];
}

export function meetingRelevantToEmails(
  meetingEmails: string[],
  memberEmails: string[]
): string[] {
  const normalized = new Set(meetingEmails.map((e) => e.toLowerCase()));
  return memberEmails.filter((e) => normalized.has(e.toLowerCase()));
}

export function meetingVisibleToUser(
  meta: {
    relevantUserEmails?: string[];
    connectedAccountEmails?: string[];
    inviteeEmails?: string[];
    participantEmails?: string[];
    hostEmail?: string;
  },
  userEmail: string,
  isAdmin: boolean
): boolean {
  if (isAdmin) return true;

  const normalized = userEmail.toLowerCase();
  const emails = [
    ...(meta.relevantUserEmails ?? []),
    ...(meta.connectedAccountEmails ?? []),
    ...(meta.inviteeEmails ?? []),
    ...(meta.participantEmails ?? []),
    meta.hostEmail,
  ]
    .filter(Boolean)
    .map((e) => e!.toLowerCase());

  return emails.includes(normalized);
}

export function buildMeetingExcerpt(
  meeting: WebexMeeting,
  enrichment: MeetingEnrichment
): string {
  if (enrichment.summary?.note) {
    return enrichment.summary.note.slice(0, 220);
  }

  const parts: string[] = [];
  if (meeting.hostDisplayName || meeting.hostEmail) {
    parts.push(`Host: ${meeting.hostDisplayName ?? meeting.hostEmail}`);
  }
  parts.push(`Ended ${new Date(meeting.end ?? meeting.start).toLocaleString()}`);

  if (meeting.hasSummary) parts.push("AI summary available in Webex");
  if (enrichment.recordings.length > 0 || meeting.hasRecording) {
    parts.push("Recording available");
  }
  if (enrichment.transcripts.length > 0 || meeting.hasTranscription) {
    parts.push("Transcript available");
  }

  return parts.join(" · ");
}

export function buildMeetingBody(
  meeting: WebexMeeting,
  enrichment: MeetingEnrichment
): string {
  const parts: string[] = [];
  parts.push(`Meeting: ${meeting.title}`);
  if (meeting.hostDisplayName || meeting.hostEmail) {
    parts.push(
      `Host: ${meeting.hostDisplayName ?? meeting.hostEmail}`
    );
  }
  parts.push(`When: ${new Date(meeting.start).toLocaleString()}`);

  if (enrichment.summary?.note) {
    parts.push(`\nAI Summary:\n${enrichment.summary.note}`);
  }

  const actionItems = enrichment.summary?.actionItems ?? [];
  if (actionItems.length > 0) {
    const lines = actionItems.map((item) =>
      typeof item === "string" ? item : item.text ?? JSON.stringify(item)
    );
    parts.push(`\nAction items:\n${lines.map((l) => `• ${l}`).join("\n")}`);
  }

  if (enrichment.recordings.length > 0) {
    parts.push(`\nRecording(s): ${enrichment.recordings.length} available`);
  }

  if (enrichment.transcripts.length > 0) {
    parts.push(`\nTranscript(s): ${enrichment.transcripts.length} available`);
  }

  return parts.join("\n");
}

export function recordingDownloadUrl(recording: WebexRecording): string | undefined {
  return (
    recording.temporaryDirectDownloadLinks?.recordingDownloadLink ??
    recording.temporaryDirectDownloadLinks?.audioDownloadLink ??
    recording.downloadUrl ??
    recording.playbackUrl
  );
}

export function transcriptDownloadUrl(
  transcript: WebexMeetingTranscript
): string | undefined {
  return transcript.txtDownloadLink ?? transcript.vttDownloadLink;
}
