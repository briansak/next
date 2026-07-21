import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import {
  importEmlFiles,
  importFromAppleCalendar,
  importFromAppleMail,
  importOutlookArchive,
} from "@/lib/integrations/email/ingest";

/** Apple Mail import runs find + sqlite; allow up to 2 minutes. */
export const maxDuration = 120;

const MAX_EML_FILES = 50;

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const mode = form.get("mode")?.toString();

  if (mode === "apple-mail") {
    const result = await importFromAppleMail();
    return NextResponse.json({
      ok: result.errors.length === 0 || result.imported > 0,
      ...result,
    });
  }

  if (mode === "apple-calendar") {
    const result = await importFromAppleCalendar();
    return NextResponse.json({
      ok: result.errors.length === 0 || result.imported > 0,
      ...result,
    });
  }

  const entries = form.getAll("files").filter((e): e is File => e instanceof File);

  if (entries.length === 0) {
    return NextResponse.json(
      { error: "No files uploaded. Select .eml files or an Outlook archive (.zip, .pst, .mbox, .ics)." },
      { status: 400 }
    );
  }

  const archive = entries.find((file) => isArchiveFile(file.name));
  if (archive) {
    if (entries.length > 1) {
      return NextResponse.json(
        { error: "Upload one archive at a time (.zip, .pst, .mbox, or .ics)" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await archive.arrayBuffer());
    const result = await importOutlookArchive(archive.name, buffer);
    return NextResponse.json({ ok: result.errors.length === 0, ...result });
  }

  if (entries.length > MAX_EML_FILES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_EML_FILES} .eml files per upload. Use a .zip archive for bulk import.` },
      { status: 400 }
    );
  }

  const files: Array<{ name: string; content: string }> = [];
  for (const entry of entries) {
    const name = entry.name || "message.eml";
    if (!name.toLowerCase().endsWith(".eml")) {
      return NextResponse.json(
        { error: `Unsupported file ${name}. Use .eml or an Outlook archive (.zip, .pst, .mbox, .ics).` },
        { status: 400 }
      );
    }
    files.push({ name, content: await entry.text() });
  }

  const result = await importEmlFiles(files);
  return NextResponse.json({ ok: true, ...result });
}

function isArchiveFile(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith(".zip") ||
    lower.endsWith(".pst") ||
    lower.endsWith(".ics") ||
    lower.endsWith(".mbox")
  );
}
