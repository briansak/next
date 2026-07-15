/** Split Unix mbox into individual RFC822 messages. */
export function splitMbox(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, "\n");
  if (!normalized.trim()) return [];

  const chunks = normalized.split(/\n(?=From )/);
  const messages: string[] = [];

  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("From ")) {
      const firstNewline = trimmed.indexOf("\n");
      if (firstNewline === -1) continue;
      const body = trimmed.slice(firstNewline + 1).trim();
      if (body) messages.push(body);
    } else {
      messages.push(trimmed);
    }
  }

  return messages;
}
