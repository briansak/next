export function parseAddressList(value: string): string[] {
  if (!value.trim()) return [];

  const addresses: string[] = [];
  for (const segment of splitAddressHeader(value)) {
    const angle = segment.match(/<([^>]+)>/);
    const email = (angle?.[1] ?? segment).trim().toLowerCase();
    const match = email.match(/[\w.+-]+@[\w.-]+\.\w+/);
    if (match) addresses.push(match[0]);
  }

  return [...new Set(addresses)];
}

function splitAddressHeader(value: string): string[] {
  const segments: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of value) {
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
      continue;
    }
    if (char === "," && !inQuotes) {
      if (current.trim()) segments.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) segments.push(current.trim());
  return segments;
}

export function viewerInRecipients(
  viewerEmail: string,
  toAddresses: string[] = [],
  ccAddresses: string[] = []
): boolean {
  const viewer = viewerEmail.toLowerCase();
  return [...toAddresses, ...ccAddresses].some(
    (address) => address.toLowerCase() === viewer
  );
}
