"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function EmailEmlImport({
  disabled,
  policyActive,
}: {
  disabled?: boolean;
  policyActive?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = inputRef.current;
    if (!input?.files?.length) return;

    setLoading(true);
    setResult(null);
    setErrors([]);
    setWarnings([]);

    const formData = new FormData();
    for (const file of Array.from(input.files)) {
      formData.append("files", file);
    }

    const res = await fetch("/api/integrations/email/import", {
      method: "POST",
      body: formData,
    });

    setLoading(false);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErrors([data.error ?? "Import failed"]);
      return;
    }

    if (data.emails) {
      setResult(
        `Email: imported ${data.emails.imported}, updated ${data.emails.skipped}, rejected ${data.emails.rejected}. ` +
          `Calendar: imported ${data.calendar.imported}, updated ${data.calendar.skipped}, rejected ${data.calendar.rejected}.`
      );
    } else {
      setResult(
        `Imported ${data.imported}, updated ${data.skipped}, rejected ${data.rejected}`
      );
    }

    if (data.warnings?.length) setWarnings(data.warnings);
    if (data.errors?.length) setErrors(data.errors.slice(0, 15));

    input.value = "";
    router.refresh();
  }

  async function importAppleCalendar() {
    setLoading(true);
    setResult(null);
    setErrors([]);
    setWarnings([]);

    const formData = new FormData();
    formData.append("mode", "apple-calendar");

    const res = await fetch("/api/integrations/email/import", {
      method: "POST",
      body: formData,
    });

    setLoading(false);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErrors([data.error ?? "Apple Calendar import failed"]);
      return;
    }

    const calendarList = Array.isArray(data.calendars)
      ? data.calendars.join(", ")
      : "";
    setResult(
      `Apple Calendar: ${calendarList || "no calendars"}, candidates ${data.candidates ?? 0}, imported ${data.imported ?? 0}, updated ${data.skipped ?? 0}, rejected ${data.rejected ?? 0}`
    );
    if (data.warnings?.length) setWarnings(data.warnings);
    if (data.errors?.length) setErrors(data.errors.slice(0, 15));
    router.refresh();
  }

  async function importAppleMail() {
    setLoading(true);
    setResult(null);
    setErrors([]);
    setWarnings([]);

    const formData = new FormData();
    formData.append("mode", "apple-mail");

    const res = await fetch("/api/integrations/email/import", {
      method: "POST",
      body: formData,
    });

    setLoading(false);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErrors([data.error ?? "Apple Mail import failed"]);
      return;
    }

    setResult(
      `Apple Mail: scanned ${data.filesScanned ?? data.scanned ?? 0}, candidates ${data.candidates ?? 0}, imported ${data.imported ?? 0}, updated ${data.skipped ?? 0}, rejected ${data.rejected ?? 0}${data.root ? ` · ${data.root}` : ""}`
    );
    if (data.warnings?.length) setWarnings(data.warnings);
    if (data.errors?.length) setErrors(data.errors.slice(0, 15));
    router.refresh();
  }

  async function activatePolicy() {
    setLoading(true);
    setErrors([]);
    const res = await fetch("/api/integrations/email/policy", {
      method: "POST",
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErrors([data.error ?? "Could not activate policy"]);
      return;
    }
    setResult("Email policy activated. You can import archives now.");
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {!policyActive && (
        <button
          type="button"
          onClick={activatePolicy}
          disabled={disabled || loading}
          style={{
            alignSelf: "flex-start",
            background: "transparent",
            color: "var(--text)",
            border: "1px solid var(--border)",
            padding: "0.5rem 1rem",
            borderRadius: 8,
            fontSize: "0.875rem",
            opacity: disabled || loading ? 0.6 : 1,
          }}
        >
          {loading ? "Activating…" : "Activate email policy"}
        </button>
      )}
      <form
        onSubmit={onSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".eml,.zip,.pst,.ics,.mbox"
          multiple
          disabled={disabled || loading || !policyActive}
          style={{ fontSize: "0.875rem" }}
        />
        <button
          type="submit"
          disabled={disabled || loading || !policyActive}
          style={{
            alignSelf: "flex-start",
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            padding: "0.5rem 1rem",
            borderRadius: 8,
            fontSize: "0.875rem",
            opacity: disabled || loading || !policyActive ? 0.6 : 1,
          }}
        >
          {loading ? "Importing…" : "Import archive or .eml files"}
        </button>
        <button
          type="button"
          onClick={importAppleMail}
          disabled={disabled || loading || !policyActive}
          style={{
            alignSelf: "flex-start",
            background: "transparent",
            color: "var(--text)",
            border: "1px solid var(--border)",
            padding: "0.5rem 1rem",
            borderRadius: 8,
            fontSize: "0.875rem",
            opacity: disabled || loading || !policyActive ? 0.6 : 1,
          }}
        >
          {loading ? "Scanning…" : "Import from Apple Mail"}
        </button>
        <button
          type="button"
          onClick={importAppleCalendar}
          disabled={disabled || loading || !policyActive}
          style={{
            alignSelf: "flex-start",
            background: "transparent",
            color: "var(--text)",
            border: "1px solid var(--border)",
            padding: "0.5rem 1rem",
            borderRadius: 8,
            fontSize: "0.875rem",
            opacity: disabled || loading || !policyActive ? 0.6 : 1,
          }}
        >
          {loading ? "Reading…" : "Import from Apple Calendar"}
        </button>
        {result && (
          <p style={{ color: "var(--low)", fontSize: "0.875rem", margin: 0 }}>
            {result}
          </p>
        )}
        {warnings.map((warn) => (
          <p
            key={warn}
            style={{ color: "var(--text-muted)", fontSize: "0.8rem", margin: 0 }}
          >
            {warn}
          </p>
        ))}
        {errors.length > 0 && (
          <ul
            style={{
              margin: 0,
              paddingLeft: "1.1rem",
              color: "var(--critical)",
              fontSize: "0.8rem",
            }}
          >
            {errors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        )}
        {!policyActive && (
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "0.75rem",
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            Activate the email policy first. Partner rules (@wwt.com, [WWT]) boost priority
            on My Priorities but do not block imports.
          </p>
        )}
      </form>
    </div>
  );
}
