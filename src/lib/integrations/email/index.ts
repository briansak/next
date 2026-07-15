export {
  matchesEmailAllowlist,
  scoreEmailPartnerPriority,
  scoreCalendarPartnerPriority,
  type EmailAllowlistRule,
  type EmailMessage,
  type PartnerPriorityMatch,
} from "./allowlist";

// Microsoft 365 is the email source for MVP
export {
  fetchAllowlistedEmails,
  fetchMailboxEmails,
  getMicrosoft365OAuthUrl,
  getMicrosoft365Config,
} from "@/lib/integrations/microsoft365";
