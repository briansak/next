import { normalizeEmailBodyText } from "../integrations/email/body-text";

export function formatCommunicationBody(body: string): string {
  if (!body.trim()) return "";
  return normalizeEmailBodyText(body);
}
