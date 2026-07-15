import { execFile } from "child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { emlxToEml } from "./emlx";
import { splitMbox } from "./mbox";
import { parseIcs } from "./ics";

const execFileAsync = promisify(execFile);

const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;
const MAX_EXTRACTED_FILES = 1000;
const EXTRACT_TIMEOUT_MS = 300_000;

export interface ExtractedArchive {
  emlFiles: Array<{ name: string; content: string }>;
  icsFiles: Array<{ name: string; content: string }>;
  warnings: string[];
}

export function archiveImportEnabled(): boolean {
  return true;
}

export function pstExtractionEnabled(): boolean {
  return process.env.ENABLE_PST_IMPORT === "true";
}

function resolveUnzipBin(): string {
  return process.env.UNZIP_BIN?.trim() || "unzip";
}

function resolveReadpstBin(): string {
  return process.env.READPST_BIN?.trim() || "readpst";
}

export function validateArchiveSize(bytes: number): boolean {
  return bytes > 0 && bytes <= MAX_ARCHIVE_BYTES;
}

export async function extractOutlookArchive(
  filename: string,
  data: Buffer
): Promise<ExtractedArchive> {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".ics")) {
    return {
      emlFiles: [],
      icsFiles: [{ name: filename, content: data.toString("utf8") }],
      warnings: [],
    };
  }

  const workDir = await mkdtemp(join(tmpdir(), "next-outlook-archive-"));
  const inputPath = join(workDir, filename);

  try {
    await writeFile(inputPath, data);

    if (lower.endsWith(".zip")) {
      return await extractZip(inputPath, workDir);
    }

    if (lower.endsWith(".mbox")) {
      const content = await readFile(inputPath, "utf8");
      return {
        emlFiles: splitMbox(content).map((content, index) => ({
          name: `upload.mbox#${index + 1}`,
          content,
        })),
        icsFiles: [],
        warnings: [],
      };
    }

    if (lower.endsWith(".pst")) {
      return await extractPst(inputPath, workDir);
    }

    throw new Error("Unsupported archive type. Use .zip, .pst, or .ics");
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function extractZip(
  zipPath: string,
  workDir: string
): Promise<ExtractedArchive> {
  const outDir = join(workDir, "extracted");
  await execFileAsync(
    resolveUnzipBin(),
    ["-q", "-o", zipPath, "-d", outDir],
    { timeout: EXTRACT_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }
  );
  return collectExtractedFiles(outDir, []);
}

async function extractPst(
  pstPath: string,
  workDir: string
): Promise<ExtractedArchive> {
  if (!pstExtractionEnabled()) {
    throw new Error(
      "PST import requires readpst. Install libpst (e.g. brew install libpst), set ENABLE_PST_IMPORT=true and READPST_BIN=readpst"
    );
  }

  const outDir = join(workDir, "pst-out");
  await execFileAsync(
    resolveReadpstBin(),
    ["-S", "-e", "-o", outDir, pstPath],
    { timeout: EXTRACT_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }
  );

  return collectExtractedFiles(outDir, [
    "Extracted messages from PST. Calendar items are included if readpst wrote .ics files.",
  ]);
}

async function collectExtractedFiles(
  rootDir: string,
  warnings: string[]
): Promise<ExtractedArchive> {
  const emlFiles: Array<{ name: string; content: string }> = [];
  const icsFiles: Array<{ name: string; content: string }> = [];

  await walkDir(rootDir, async (path, name) => {
    const lower = name.toLowerCase();
    if (lower.endsWith(".eml")) {
      emlFiles.push({ name, content: await readFile(path, "utf8") });
    } else if (lower.endsWith(".emlx") || lower.endsWith(".partial.emlx")) {
      emlFiles.push({
        name,
        content: emlxToEml(await readFile(path, "utf8")),
      });
    } else if (lower.endsWith(".ics")) {
      icsFiles.push({ name, content: await readFile(path, "utf8") });
    } else if (name === "mbox" || lower.endsWith(".mbox")) {
      const parts = splitMbox(await readFile(path, "utf8"));
      parts.forEach((content, index) => {
        emlFiles.push({ name: `${name}#${index + 1}`, content });
      });
    }
  });

  if (emlFiles.length + icsFiles.length > MAX_EXTRACTED_FILES) {
    throw new Error(
      `Archive contains more than ${MAX_EXTRACTED_FILES} items. Export a smaller date range.`
    );
  }

  if (emlFiles.length === 0 && icsFiles.length === 0) {
    warnings.push("No .eml or .ics files found in archive");
  }

  return { emlFiles, icsFiles, warnings };
}

async function walkDir(
  dir: string,
  onFile: (path: string, name: string) => Promise<void>
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(path, onFile);
    } else if (entry.isFile()) {
      await onFile(path, entry.name);
    }
  }
}

/** Parse inline .ics content blocks (e.g. multiple calendars in one file). */
export function parseIcsFiles(
  files: Array<{ name: string; content: string }>
): Array<{ name: string; events: ReturnType<typeof parseIcs> }> {
  return files.map((file) => ({
    name: file.name,
    events: parseIcs(file.content),
  }));
}
