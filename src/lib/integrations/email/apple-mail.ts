import { access, readdir, readFile, stat } from "fs/promises";
import { homedir } from "os";
import { join, resolve } from "path";
import { emlxToEml } from "./emlx";
import { splitMbox } from "./mbox";

const MAX_APPLE_MAIL_MESSAGES = 2000;
const DEFAULT_LOOKBACK_DAYS = 14;

export interface AppleMailMessageFile {
  name: string;
  content: string;
  sourcePath: string;
}

export interface AppleMailScanResult {
  root: string;
  filesScanned: number;
  messages: AppleMailMessageFile[];
  warnings: string[];
}

export function appleMailImportEnabled(): boolean {
  return process.env.ENABLE_APPLE_MAIL_IMPORT === "true";
}

export function resolveAppleMailRoot(): string {
  const configured = process.env.APPLE_MAIL_PATH?.trim();
  if (configured) {
    return expandHome(configured);
  }
  return join(homedir(), "Library", "Mail");
}

function expandHome(path: string): string {
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

/** Ensure path stays under the allowed Apple Mail root. */
export function assertWithinAppleMailRoot(
  root: string,
  target: string
): string {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  if (
    resolvedTarget !== resolvedRoot &&
    !resolvedTarget.startsWith(`${resolvedRoot}/`)
  ) {
    throw new Error("Apple Mail path is outside the allowed mail directory");
  }
  return resolvedTarget;
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function scanAppleMailMessages(
  options?: { root?: string; lookbackDays?: number }
): Promise<AppleMailScanResult> {
  const mailRoot = resolveAppleMailRoot();
  const root = assertWithinAppleMailRoot(
    mailRoot,
    options?.root ?? mailRoot
  );
  const lookbackDays =
    options?.lookbackDays ??
    Number(process.env.APPLE_MAIL_LOOKBACK_DAYS ?? DEFAULT_LOOKBACK_DAYS);

  const warnings: string[] = [];
  const messages: AppleMailMessageFile[] = [];
  let filesScanned = 0;

  if (!(await pathExists(root))) {
    return {
      root,
      filesScanned: 0,
      messages: [],
      warnings: [
        `Apple Mail directory not found at ${root}. Add the account in Mail.app and sync first.`,
      ],
    };
  }

  const versionDirs = await listMailVersionDirs(root);
  if (versionDirs.length === 0) {
    warnings.push(
      `No Mail data found under ${root}. Open Mail.app, add your account, and wait for messages to download.`
    );
    return { root, filesScanned, messages, warnings };
  }

  const cutoff =
    lookbackDays > 0
      ? Date.now() - lookbackDays * 24 * 60 * 60 * 1000
      : 0;

  for (const versionDir of versionDirs) {
    await walkMailTree(versionDir, async (filePath, fileName) => {
      if (messages.length >= MAX_APPLE_MAIL_MESSAGES) return;

      const lower = fileName.toLowerCase();
      if (lower.endsWith(".emlx") || lower.endsWith(".partial.emlx")) {
        filesScanned++;
        const raw = await readFile(filePath, "utf8");
        const eml = emlxToEml(raw);
        if (!eml.trim()) return;
        if (cutoff > 0 && !messageMaybeInLookback(eml, cutoff)) return;
        messages.push({
          name: fileName,
          content: eml,
          sourcePath: filePath,
        });
        return;
      }

      if (lower.endsWith(".eml")) {
        filesScanned++;
        const eml = await readFile(filePath, "utf8");
        if (cutoff > 0 && !messageMaybeInLookback(eml, cutoff)) return;
        messages.push({ name: fileName, content: eml, sourcePath: filePath });
        return;
      }

      if (fileName === "mbox") {
        filesScanned++;
        const raw = await readFile(filePath, "utf8");
        const parts = splitMbox(raw);
        for (const [index, eml] of parts.entries()) {
          if (messages.length >= MAX_APPLE_MAIL_MESSAGES) break;
          if (cutoff > 0 && !messageMaybeInLookback(eml, cutoff)) continue;
          messages.push({
            name: `${fileName}#${index + 1}`,
            content: eml,
            sourcePath: filePath,
          });
        }
      }
    });
  }

  if (messages.length === 0 && warnings.length === 0) {
    warnings.push(
      "No .emlx or mbox messages found. Mail.app may still be syncing, or macOS privacy blocked read access (grant Full Disk Access to your terminal/Node)."
    );
  }

  return { root, filesScanned, messages, warnings };
}

async function listMailVersionDirs(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const versionDirs = entries
    .filter((e) => e.isDirectory() && /^V\d+$/i.test(e.name))
    .map((e) => join(root, e.name));

  if (versionDirs.length > 0) return versionDirs;

  const rootStat = await stat(root).catch(() => null);
  if (rootStat?.isDirectory()) return [root];

  return [];
}

async function walkMailTree(
  dir: string,
  onFile: (path: string, name: string) => Promise<void>
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkMailTree(path, onFile);
    } else if (entry.isFile()) {
      await onFile(path, entry.name);
    }
  }
}

function messageMaybeInLookback(eml: string, cutoffMs: number): boolean {
  const dateLine = eml.match(/^Date:\s*(.+)$/im)?.[1];
  if (!dateLine) return true;
  const parsed = new Date(dateLine.trim());
  if (Number.isNaN(parsed.getTime())) return true;
  return parsed.getTime() >= cutoffMs;
}
