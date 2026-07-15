export {
  matchesEmailAllowlist,
  type EmailAllowlistRule,
  type EmailMessage,
} from "./allowlist";

// Microsoft 365 is the email source for MVP
export {
  fetchAllowlistedEmails,
  getMicrosoft365OAuthUrl,
  getMicrosoft365Config,
} from "@/lib/integrations/microsoft365";
