import { createHash } from "crypto";
import type { EmailMessage } from "./allowlist";
import { parseAddressList } from "./recipients";

export interface ParsedEml {
  messageId: string;
  subject: string;
  body: string;
  fromAddress: string;
  fromName?: string;
  receivedAt: Date;
  threadId?: string;
  toAddresses: string[];
  ccAddresses: string[];
  listId?: string;
  precedence?: string;
  listUnsubscribe?: string;
  autoSubmitted?: string;
}

const MAX_EML_BYTES = 5 * 1024 * 1024;

export function parseEml(raw: string): ParsedEml | null {
  const normalized = raw.replace(/\r\n/g, "\n");
  if (!normalized.trim()) return null;

  const headerBodySplit = normalized.match(/\n\n/);
  const headerBlock = headerBodySplit
    ? normalized.slice(0, headerBodySplit.index)
    : normalized;
  const bodyBlock = headerBodySplit
    ? normalized.slice(headerBodySplit.index! + 2)
    : "";

  const headers = parseHeaders(headerBlock);
  const from = parseFromHeader(headers.get("from") ?? "");
  if (!from.address) return null;

  const subject = decodeHeaderValue(headers.get("subject") ?? "(no subject)");
  const receivedAt = parseDateHeader(
    headers.get("date") ?? headers.get("received") ?? ""
  );
  const messageIdHeader = headers.get("message-id");
  const messageId = messageIdHeader
    ? messageIdHeader.replace(/^<|>$/g, "")
    : fallbackMessageId(from.address, subject, receivedAt);

  const contentType = headers.get("content-type") ?? "text/plain";
  const body = extractBody(bodyBlock, contentType);
  const toAddresses = parseAddressList(headers.get("to") ?? "");
  const ccAddresses = parseAddressList(headers.get("cc") ?? "");

  return {
    messageId,
    subject,
    body,
    fromAddress: from.address,
    fromName: from.name,
    receivedAt,
    threadId: headers.get("in-reply-to")?.replace(/^<|>$/g, "") ?? messageId,
    toAddresses,
    ccAddresses,
    listId: headers.get("list-id"),
    precedence: headers.get("precedence"),
    listUnsubscribe: headers.get("list-unsubscribe"),
    autoSubmitted: headers.get("auto-submitted"),
  };
}

export function parsedEmlToEmailMessage(parsed: ParsedEml): EmailMessage {
  return {
    messageId: parsed.messageId,
    subject: parsed.subject,
    body: parsed.body,
    fromAddress: parsed.fromAddress,
    fromName: parsed.fromName,
    receivedAt: parsed.receivedAt,
    threadId: parsed.threadId,
    toAddresses: parsed.toAddresses,
    ccAddresses: parsed.ccAddresses,
    listId: parsed.listId,
    precedence: parsed.precedence,
    listUnsubscribe: parsed.listUnsubscribe,
    autoSubmitted: parsed.autoSubmitted,
  };
}

export function validateEmlSize(bytes: number): boolean {
  return bytes > 0 && bytes <= MAX_EML_BYTES;
}

function parseHeaders(headerBlock: string): Map<string, string> {
  const lines = headerBlock.split("\n");
  const unfolded: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += ` ${line.trim()}`;
    } else {
      unfolded.push(line);
    }
  }

  const headers = new Map<string, string>();
  for (const line of unfolded) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    headers.set(key, value);
  }
  return headers;
}

function parseFromHeader(value: string): { name?: string; address: string } {
  const angle = value.match(/<([^>]+)>/);
  if (angle) {
    const address = angle[1].trim().toLowerCase();
    const name = value.replace(angle[0], "").replace(/"/g, "").trim();
    return { name: name || undefined, address };
  }
  const email = value.match(/[\w.+-]+@[\w.-]+\.\w+/);
  return { address: email?.[0]?.toLowerCase() ?? "" };
}

function parseDateHeader(value: string): Date {
  if (!value) return new Date();
  const primary = value.split(";").pop()?.trim() ?? value;
  const parsed = new Date(primary);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function decodeHeaderValue(value: string): string {
  return value
    .replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (_, _charset, encoding, text) => {
      if (encoding.toUpperCase() === "B") {
        try {
          return Buffer.from(text, "base64").toString("utf8");
        } catch {
          return text;
        }
      }
      return text.replace(/=([0-9A-F]{2})/gi, (_m: string, hex: string) =>
        String.fromCharCode(parseInt(hex, 16))
      );
    })
    .trim();
}

function extractBody(bodyBlock: string, contentType: string): string {
  const type = contentType.toLowerCase();

  if (type.includes("multipart/")) {
    const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/i);
    if (!boundaryMatch) return stripHtml(bodyBlock.trim());
    return extractMultipart(bodyBlock, boundaryMatch[1]);
  }

  if (type.includes("text/html")) {
    return stripHtml(decodePart(bodyBlock, contentType));
  }

  return decodePart(bodyBlock, contentType).trim();
}

function extractMultipart(bodyBlock: string, boundary: string): string {
  const parts = bodyBlock.split(`--${boundary}`);
  let plain = "";
  let html = "";

  for (const part of parts) {
    if (!part.trim() || part.trim() === "--") continue;
    const split = part.match(/\n\n/);
    if (!split) continue;

    const partHeaders = parseHeaders(part.slice(0, split.index));
    const partBody = part.slice(split.index! + 2);
    const partType = partHeaders.get("content-type") ?? "text/plain";

    if (partType.includes("multipart/")) {
      const nested = partType.match(/boundary="?([^";\s]+)"?/i);
      if (nested) {
        const nestedBody = extractMultipart(partBody, nested[1]);
        if (nestedBody) return nestedBody;
      }
      continue;
    }

    if (partType.includes("text/plain") && !plain) {
      plain = decodePart(partBody, partType).trim();
    } else if (partType.includes("text/html") && !html) {
      html = stripHtml(decodePart(partBody, partType));
    }
  }

  return plain || html || bodyBlock.trim().slice(0, 2000);
}

function decodePart(body: string, contentType: string): string {
  const encoding =
    contentType.match(/charset="?([^";\s]+)"?/i)?.[1] ?? "utf-8";
  const transfer = contentType.includes("base64")
    ? "base64"
    : body.includes("=\n") || /=([0-9A-F]{2})/i.test(body)
      ? "quoted-printable"
      : "7bit";

  let text = body.trim();

  if (transfer === "base64") {
    try {
      text = Buffer.from(text.replace(/\s+/g, ""), "base64").toString(
        encoding as BufferEncoding
      );
    } catch {
      /* keep raw */
    }
  } else if (transfer === "quoted-printable") {
    text = text
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-F]{2})/gi, (_m: string, hex: string) =>
        String.fromCharCode(parseInt(hex, 16))
      );
  }

  return text;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function fallbackMessageId(
  fromAddress: string,
  subject: string,
  receivedAt: Date
): string {
  return createHash("sha256")
    .update(`${fromAddress}|${subject}|${receivedAt.toISOString()}`)
    .digest("hex")
    .slice(0, 40);
}
