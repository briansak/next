import { access, readdir, readFile, stat, lstat } from "fs/promises";
import { homedir } from "os";
import { join, resolve } from "path";
import { emlxToEml } from "./emlx";
import { splitMbox } from "./mbox";
import {
  diagnoseAppleMailAccess,
  envelopeIndexPreferred,
  scanAppleMailViaEnvelopeIndex,
} from "./apple-mail-envelope";
import { getImportAppConfig } from "@/lib/config/app-config-store";
import type { ResolvedAppConfig } from "@/lib/config/app-config";

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
  scanMethod?: "filesystem" | "envelope-index";
  diagnostics?: string[];
}

export async function isAppleMailImportEnabled(): Promise<boolean> {
  const config = await getImportAppConfig();
  return config.enableAppleMailImport;
}

export function appleMailImportEnabledFromConfig(config: ResolvedAppConfig): boolean {
  return config.enableAppleMailImport;
}

/** Env-only fallback for legacy scripts; prefer isAppleMailImportEnabled(). */
export function appleMailImportEnabled(): boolean {
  return process.env.ENABLE_APPLE_MAIL_IMPORT === "true";
}

export async function resolveAppleMailRoot(): Promise<string> {
  const config = await getImportAppConfig();
  return resolveAppleMailRootFromConfig(config);
}

export function resolveAppleMailRootFromConfig(config: ResolvedAppConfig): string {
  const configured = config.appleMailPath?.trim();
  if (configured) {
    return expandHome(configured);
  }
  return join(homedir(), "Library", "Mail");
}

/** Env-only fallback for legacy scripts. */
export function resolveAppleMailRootFromEnv(): string {
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
  const config = await getImportAppConfig();
  const mailRoot = await resolveAppleMailRoot();
  const root = assertWithinAppleMailRoot(
    mailRoot,
    options?.root ?? mailRoot
  );
  const lookbackDays =
    options?.lookbackDays ?? config.appleMailLookbackDays ?? DEFAULT_LOOKBACK_DAYS;

  if (envelopeIndexPreferred()) {
    const envelope = await scanAppleMailViaEnvelopeIndex({
      lookbackDays,
      maxMessages: MAX_APPLE_MAIL_MESSAGES,
    });

    if (envelope.messages.length > 0 || envelope.envelopeRows > 0) {
      return {
        root: envelope.root,
        filesScanned: envelope.filesScanned,
        messages: envelope.messages,
        warnings: envelope.warnings,
        scanMethod: "envelope-index",
        diagnostics: await diagnoseAppleMailAccess(),
      };
    }
  }

  return scanAppleMailFilesystem({ root, lookbackDays });
}

async function scanAppleMailFilesystem(input: {
  root: string;
  lookbackDays: number;
}): Promise<AppleMailScanResult> {
  const { root, lookbackDays } = input;
  const warnings: string[] = [];
  const messages: AppleMailMessageFile[] = [];
  let filesScanned = 0;
  let emlxSeen = 0;
  let emlxInLookback = 0;

  if (!(await pathExists(root))) {
    return {
      root,
      filesScanned: 0,
      messages: [],
      warnings: [
        `Apple Mail directory not found at ${root}. Add the account in Mail.app and sync first.`,
      ],
      scanMethod: "filesystem",
    };
  }

  const versionDirs = await listMailVersionDirs(root);
  if (versionDirs.length === 0) {
    warnings.push(
      `No Mail data found under ${root}. Open Mail.app, add your account, and wait for messages to download.`
    );
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
        emlxSeen++;
        const raw = await readFile(filePath, "utf8");
        const eml = emlxToEml(raw);
        if (!eml.trim()) return;
        if (cutoff > 0 && !messageMaybeInLookback(eml, cutoff)) return;
        emlxInLookback++;
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

  const diagnostics = await diagnoseAppleMailAccess();

  if (messages.length === 0) {
    if (emlxSeen > 0 && emlxInLookback === 0) {
      warnings.push(
        `Found ${emlxSeen} .emlx file(s) on disk but none within the last ${lookbackDays} day lookback. Increase APPLE_MAIL_LOOKBACK_DAYS.`
      );
    } else if (emlxSeen === 0) {
      warnings.push(
        "No .emlx files found. Try envelope import (default) or grant Full Disk Access to Cursor.app and restart."
      );
    }
  }

  return {
    root,
    filesScanned,
    messages,
    warnings,
    scanMethod: "filesystem",
    diagnostics,
  };
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
      continue;
    }

    if (entry.isFile()) {
      await onFile(path, entry.name);
      continue;
    }

    if (entry.isSymbolicLink()) {
      const linkStat = await lstat(path).catch(() => null);
      if (linkStat?.isDirectory()) {
        await walkMailTree(path, onFile);
      } else if (linkStat?.isFile()) {
        await onFile(path, entry.name);
      }
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
