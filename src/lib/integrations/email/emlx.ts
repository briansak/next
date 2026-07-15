/** Apple Mail .emlx: line 1 is byte length, remainder is RFC822 message. */
export function emlxToEml(raw: string): string {
  const normalized = raw.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length === 0) return "";

  let start = 0;
  if (/^\d+$/.test(lines[0]?.trim() ?? "")) {
    start = 1;
    if (lines[start] === "") start++;
  }

  return lines.slice(start).join("\n");
}
