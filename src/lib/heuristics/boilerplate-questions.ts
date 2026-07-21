/** Signature lines and support CTAs that look like questions but are not real asks. */
const EXACT_BOILERPLATE_QUESTIONS = [
  /^need help\?$/i,
  /^can i help(?: you)?\?$/i,
  /^how can i help(?: you)?\?$/i,
  /^questions\?$/i,
  /^any questions\?$/i,
  /^have questions\?$/i,
  /^let me know if (?:you have )?(?:any )?questions\?$/i,
  /^feel free to reach out(?: if you have questions)?\.?$/i,
];

const TRAILING_BOILERPLATE_SUFFIXES = [
  /\s+(?:any )?questions\?$/i,
  /\s+need help\?$/i,
  /\s+can i help(?: you)?\?$/i,
  /\s+how can i help(?: you)?\?$/i,
];

/** Automated calendar/event mail — not a partner ask even when you're on To/Cc. */
const AUTOMATED_NOTIFICATION_PATTERNS = [
  /^you'?re registered for\b/i,
  /^you are registered for\b/i,
  /^registration (?:confirmed|complete|received)\b/i,
  /^thank you for registering\b/i,
  /^event registration\b/i,
  /^(?:canceled|cancelled|accepted|declined|updated|invitation):\s/i,
  /^reminder:\s/i,
  /\bwwt event:/i,
];

const SUBSTANTIVE_ASK_VERBS =
  /\b(?:can|could|would|please|send|share|review|confirm|provide|update|availability|when|what|how|who|which|wondering|anything you)\b/i;

export function stripTrailingBoilerplateQuestion(text: string): string {
  let result = text.trim().replace(/\s+/g, " ");
  for (const suffix of TRAILING_BOILERPLATE_SUFFIXES) {
    result = result.replace(suffix, "").trim();
  }
  return result;
}

export function isAutomatedNotificationText(text: string): boolean {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return false;
  return AUTOMATED_NOTIFICATION_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function isBoilerplateQuestion(text: string): boolean {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return true;
  if (EXACT_BOILERPLATE_QUESTIONS.some((pattern) => pattern.test(trimmed))) {
    return true;
  }

  if (isAutomatedNotificationText(trimmed)) {
    return true;
  }

  // Subject lines like "... July 29 Questions?" — footer question appended to a notification.
  if (trimmed.endsWith("?")) {
    const withoutTrailing = stripTrailingBoilerplateQuestion(trimmed);
    if (withoutTrailing !== trimmed) {
      if (!withoutTrailing || isAutomatedNotificationText(withoutTrailing)) {
        return true;
      }
      if (!SUBSTANTIVE_ASK_VERBS.test(withoutTrailing)) {
        return true;
      }
    }
  }

  // Very short "questions" with no request substance (e.g. email footers).
  if (
    trimmed.length <= 16 &&
    trimmed.endsWith("?") &&
    !SUBSTANTIVE_ASK_VERBS.test(trimmed)
  ) {
    return true;
  }

  return false;
}

export function filterSubstantiveQuestions(snippets: string[]): string[] {
  return snippets.filter((snippet) => !isBoilerplateQuestion(snippet));
}
