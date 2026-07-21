import { execFile } from "child_process";
import { promisify } from "util";
import { access, readFile, readdir } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { emlxToEml } from "./emlx";

const execFileAsync = promisify(execFile);

export interface AppleMailMessageFile {
  name: string;
  content: string;
  sourcePath: string;
}

export interface EnvelopeScanResult {
  root: string;
  filesScanned: number;
  messages: AppleMailMessageFile[];
  warnings: string[];
  envelopeRows: number;
  emlxLoaded: number;
  scanMethod: "envelope-index";
}

export interface EnvelopeMessageRef {
  rowId: number;
  dateReceived: number;
  subject: string;
  senderAddress: string;
  senderName: string | null;
}

function resolveAppleMailRoot(): string {
  const configured = process.env.APPLE_MAIL_PATH?.trim();
  if (configured?.startsWith("~/")) {
    return join(homedir(), configured.slice(2));
  }
  if (configured) return configured;
  return join(homedir(), "Library", "Mail");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function parseRowIdFromEmlxPath(filePath: string): number | null {
  const base = filePath.split("/").pop() ?? "";
  const match = base.match(/^(\d+)\.(?:partial\.)?emlx$/i);
  if (!match?.[1]) return null;
  const rowId = Number.parseInt(match[1], 10);
  return Number.isFinite(rowId) ? rowId : null;
}

/** One find pass per Mail version dir — much faster than per-message lookup. */
export async function buildEmlxPathMap(
  versionDir: string,
  lookbackDays: number
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const args = [
    versionDir,
    "(",
    "-name",
    "*.emlx",
    "-o",
    "-name",
    "*.partial.emlx",
    ")",
  ];

  if (lookbackDays > 0) {
    args.push("-mtime", `-${lookbackDays}`);
  }

  try {
    const { stdout } = await execFileAsync("find", args, {
      maxBuffer: 64 * 1024 * 1024,
      timeout: 120_000,
    });

    for (const line of stdout.split("\n")) {
      const path = line.trim();
      if (!path) continue;
      const rowId = parseRowIdFromEmlxPath(path);
      if (rowId === null) continue;

      const existing = map.get(rowId);
      if (!existing || (existing.includes(".partial.") && !path.includes(".partial."))) {
        map.set(rowId, path);
      }
    }
  } catch {
    return map;
  }

  return map;
}

export async function resolveEnvelopeIndexPaths(
  mailRoot?: string
): Promise<Array<{ versionDir: string; dbPath: string }>> {
  const root = mailRoot ?? resolveAppleMailRoot();
  if (!(await pathExists(root))) return [];

  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);

  const paths: Array<{ versionDir: string; dbPath: string }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^V\d+$/i.test(entry.name)) continue;
    const versionDir = join(root, entry.name);
    const dbPath = join(versionDir, "MailData", "Envelope Index");
    if (await pathExists(dbPath)) {
      paths.push({ versionDir, dbPath });
    }
  }

  return paths;
}

export async function queryEnvelopeMessages(
  dbPath: string,
  sinceUnix: number,
  limit: number
): Promise<EnvelopeMessageRef[]> {
  const sql = `
    SELECT
      m.ROWID AS rowid,
      m.date_received AS date_received,
      COALESCE(s.subject, '') AS subject,
      COALESCE(a.address, '') AS sender_address,
      COALESCE(a.comment, '') AS sender_name
    FROM messages m
    LEFT JOIN subjects s ON m.subject = s.ROWID
    LEFT JOIN addresses a ON m.sender = a.ROWID
    LEFT JOIN mailboxes mb ON m.mailbox = mb.ROWID
    WHERE m.deleted = 0
      AND m.date_received >= ${sinceUnix}
      AND COALESCE(mb.url, '') NOT LIKE '%Spam%'
      AND COALESCE(mb.url, '') NOT LIKE '%Trash%'
      AND COALESCE(mb.url, '') NOT LIKE '%Junk%'
      AND COALESCE(mb.url, '') NOT LIKE '%Draft%'
    ORDER BY m.date_received DESC
    LIMIT ${limit};
  `.trim();

  try {
    const { stdout } = await execFileAsync(
      "sqlite3",
      ["-readonly", "-separator", "\t", dbPath, sql],
      { maxBuffer: 4 * 1024 * 1024, timeout: 30_000 }
    );

    const rows: EnvelopeMessageRef[] = [];
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      const [rowIdRaw, dateRaw, subject, senderAddress, senderName] =
        line.split("\t");
      const rowId = Number.parseInt(rowIdRaw ?? "", 10);
      const dateReceived = Number.parseInt(dateRaw ?? "", 10);
      if (!Number.isFinite(rowId) || !Number.isFinite(dateReceived)) continue;
      rows.push({
        rowId,
        dateReceived,
        subject: subject ?? "",
        senderAddress: senderAddress ?? "",
        senderName: senderName?.trim() ? senderName.trim() : null,
      });
    }
    return rows;
  } catch {
    return [];
  }
}

export async function readEmlxAsEml(path: string): Promise<string | null> {
  try {
    const raw = await readFile(path, "utf8");
    const eml = emlxToEml(raw);
    return eml.trim() ? eml : null;
  } catch {
    return null;
  }
}

export function envelopeIndexPreferred(): boolean {
  return process.env.APPLE_MAIL_FILESYSTEM_WALK !== "true";
}

export async function scanAppleMailViaEnvelopeIndex(input: {
  lookbackDays: number;
  maxMessages?: number;
}): Promise<EnvelopeScanResult> {
  const mailRoot = resolveAppleMailRoot();
  const warnings: string[] = [];
  const messages: AppleMailMessageFile[] = [];
  const maxMessages = input.maxMessages ?? 2000;
  const sinceUnix =
    Math.floor(Date.now() / 1000) - input.lookbackDays * 24 * 60 * 60;

  const indexPaths = await resolveEnvelopeIndexPaths(mailRoot);
  if (indexPaths.length === 0) {
    return {
      root: mailRoot,
      filesScanned: 0,
      messages: [],
      warnings: [
        "Could not open Mail Envelope Index (~/Library/Mail/V*/MailData/Envelope Index). Grant Full Disk Access to the app running npm (e.g. Terminal.app) and restart it.",
      ],
      envelopeRows: 0,
      emlxLoaded: 0,
      scanMethod: "envelope-index",
    };
  }

  let envelopeRows = 0;
  let emlxLoaded = 0;
  let mapSize = 0;

  for (const { versionDir, dbPath } of indexPaths) {
    const refs = await queryEnvelopeMessages(
      dbPath,
      sinceUnix,
      maxMessages - messages.length
    );
    envelopeRows += refs.length;
    if (refs.length === 0) continue;

    const pathMap = await buildEmlxPathMap(versionDir, input.lookbackDays);
    mapSize += pathMap.size;

    for (const ref of refs) {
      if (messages.length >= maxMessages) break;

      const emlxPath = pathMap.get(ref.rowId);
      if (!emlxPath) continue;

      const eml = await readEmlxAsEml(emlxPath);
      if (!eml) continue;

      emlxLoaded++;
      messages.push({
        name: `${ref.rowId}.emlx`,
        content: eml,
        sourcePath: emlxPath,
      });
    }
  }

  if (envelopeRows > 0 && messages.length === 0) {
    warnings.push(
      `${envelopeRows} recent message(s) in Mail index but no matching .emlx files in the last ${input.lookbackDays} day(s) (${mapSize} cached paths). Open Mail.app → select message → Mailbox → Synchronize.`
    );
  } else if (messages.length > 0) {
    warnings.push(
      `Loaded ${messages.length} message(s) via Mail Envelope Index (${mapSize} .emlx paths indexed).`
    );
  }

  return {
    root: mailRoot,
    filesScanned: emlxLoaded,
    messages,
    warnings,
    envelopeRows,
    emlxLoaded,
    scanMethod: "envelope-index",
  };
}

/** Probe whether Mail data is readable and report likely cause when it is not. */
export async function diagnoseAppleMailAccess(): Promise<string[]> {
  const notes: string[] = [];
  const mailRoot = resolveAppleMailRoot();

  if (!(await pathExists(mailRoot))) {
    notes.push(`Mail folder not found at ${mailRoot}.`);
    return notes;
  }

  const top = await readdir(mailRoot, { withFileTypes: true }).catch(
    (err: NodeJS.ErrnoException) => {
      notes.push(
        `Cannot list ${mailRoot}: ${err.code ?? err.message}. Grant Full Disk Access to the app running npm (System Settings → Privacy & Security → Full Disk Access), then restart that app.`
      );
      return [];
    }
  );

  const versionDirs = top.filter(
    (e) => e.isDirectory() && /^V\d+$/i.test(e.name)
  );
  if (versionDirs.length === 0) {
    notes.push(
      `No V* mail version folder under ${mailRoot}. Open Mail.app and confirm accounts are syncing.`
    );
  } else {
    notes.push(
      `Found Mail version folder(s): ${versionDirs.map((d) => d.name).join(", ")}.`
    );
  }

  const indexes = await resolveEnvelopeIndexPaths(mailRoot);
  if (indexes.length === 0) {
    notes.push("Envelope Index database not readable.");
  } else {
    const sample = await queryEnvelopeMessages(
      indexes[0]!.dbPath,
      Math.floor(Date.now() / 1000) - 14 * 86400,
      3
    );
    notes.push(
      `Envelope Index readable (${indexes.length} db). Recent rows sample: ${sample.length}.`
    );
  }

  return notes;
}
