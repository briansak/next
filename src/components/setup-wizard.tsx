"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const STEPS = ["Welcome", "Partner", "Preferences", "Webex"] as const;

interface SetupForm {
  name: string;
  partnerName: string;
  emailDomain: string;
  subjectPrefix: string;
  partnerAskSlaHours: number;
  ollamaBaseUrl: string;
  ollamaModel: string;
  enableIngestionPoll: boolean;
  allowOllamaSummaries: boolean;
  enableMeetingOllamaSummary: boolean;
  enableGongEmailCorrelation: boolean;
  enableAppleMailImport: boolean;
  enableAppleCalendarImport: boolean;
  appleCalendarNames: string;
}

const defaultForm: SetupForm = {
  name: "",
  partnerName: "",
  emailDomain: "",
  subjectPrefix: "",
  partnerAskSlaHours: 48,
  ollamaBaseUrl: "",
  ollamaModel: "llama3.1:8b",
  enableIngestionPoll: false,
  allowOllamaSummaries: false,
  enableMeetingOllamaSummary: false,
  enableGongEmailCorrelation: true,
  enableAppleMailImport: false,
  enableAppleCalendarImport: false,
  appleCalendarNames: "",
};

export function SetupWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<SetupForm>(defaultForm);
  const [webexConfigured, setWebexConfigured] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const webexConnected = searchParams.get("connected") === "webex";

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/setup");
      if (!res.ok) return;
      const data = await res.json();
      if (data.complete) {
        router.replace("/dashboard");
        return;
      }
      setWebexConfigured(Boolean(data.webexConfigured));
      if (data.draft?.name || data.draft?.partnerName) {
        setForm((current) => ({
          ...current,
          name: data.draft.name ?? current.name,
          partnerName: data.draft.partnerName ?? current.partnerName,
        }));
        setDraftReady(true);
      }
      if (webexConnected) {
        setStep(3);
      }
    })();
  }, [router, webexConnected]);

  const progress = useMemo(
    () => `${Math.round(((step + 1) / STEPS.length) * 100)}%`,
    [step]
  );

  const updateField = useCallback(
    <K extends keyof SetupForm>(key: K, value: SetupForm[K]) => {
      setForm((current) => ({ ...current, [key]: value }));
    },
    []
  );

  async function initializeDraft() {
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "initialize",
        name: form.name.trim(),
        partnerName: form.partnerName.trim(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error ?? "Could not save your profile");
    }
    setDraftReady(true);
  }

  async function goNext() {
    setError(null);

    if (step === 0) {
      if (!form.name.trim()) {
        setError("Enter your name to continue.");
        return;
      }
      setStep(1);
      return;
    }

    if (step === 1) {
      if (!form.partnerName.trim()) {
        setError("Enter the partner organization you support.");
        return;
      }
      setBusy(true);
      try {
        await initializeDraft();
        setStep(2);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not continue");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (step === 2) {
      setStep(3);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          name: form.name.trim(),
          partnerName: form.partnerName.trim(),
          emailDomains: form.emailDomain
            .split(/[,;\s]+/)
            .map((value) => value.trim())
            .filter(Boolean),
          subjectPrefixes: form.subjectPrefix
            .split(/[,;\s]+/)
            .map((value) => value.trim())
            .filter(Boolean),
          partnerAskSlaHours: form.partnerAskSlaHours,
          ollamaBaseUrl: form.ollamaBaseUrl.trim() || null,
          ollamaModel: form.ollamaModel.trim() || null,
          enableIngestionPoll: form.enableIngestionPoll,
          allowOllamaSummaries: form.allowOllamaSummaries,
          enableMeetingOllamaSummary: form.enableMeetingOllamaSummary,
          enableGongEmailCorrelation: form.enableGongEmailCorrelation,
          enableAppleMailImport: form.enableAppleMailImport,
          enableAppleCalendarImport: form.enableAppleCalendarImport,
          appleCalendarNames: form.appleCalendarNames.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Could not finish setup");
      }
      router.replace(data.redirect ?? "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish setup");
    } finally {
      setBusy(false);
    }
  }

  function goBack() {
    setError(null);
    setStep((current) => Math.max(0, current - 1));
  }

  return (
    <div className="setup-shell">
      <div className="setup-card">
        <header className="setup-header">
          <p className="setup-kicker">First launch</p>
          <h1>Set up Next on your laptop</h1>
          <p className="setup-lead">
            Tell us who you support and how you work. You can change everything later in Settings.
          </p>
          <div className="setup-progress" aria-hidden>
            <div className="setup-progress__bar" style={{ width: progress }} />
          </div>
          <ol className="setup-steps" aria-label="Setup progress">
            {STEPS.map((label, index) => (
              <li
                key={label}
                className={
                  index === step
                    ? "setup-steps__item setup-steps__item--active"
                    : index < step
                      ? "setup-steps__item setup-steps__item--done"
                      : "setup-steps__item"
                }
              >
                {label}
              </li>
            ))}
          </ol>
        </header>

        {error ? <p className="setup-error">{error}</p> : null}

        {step === 0 ? (
          <section className="setup-section">
            <label className="setup-label">
              Your name
              <input
                className="setup-input"
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="Alex Rivera"
                autoFocus
              />
            </label>
            <p className="setup-hint">
              Used for @mentions and next-step ownership on your dashboard.
            </p>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="setup-section">
            <label className="setup-label">
              Partner organization
              <input
                className="setup-input"
                value={form.partnerName}
                onChange={(event) => updateField("partnerName", event.target.value)}
                placeholder="Acme Corp"
              />
            </label>
            <label className="setup-label">
              Partner email domain
              <input
                className="setup-input"
                value={form.emailDomain}
                onChange={(event) => updateField("emailDomain", event.target.value)}
                placeholder="acme.com"
              />
            </label>
            <label className="setup-label">
              Partner subject prefix
              <input
                className="setup-input"
                value={form.subjectPrefix}
                onChange={(event) => updateField("subjectPrefix", event.target.value)}
                placeholder="[ACME]"
              />
            </label>
            <label className="setup-label">
              Partner response SLA (hours)
              <input
                className="setup-input"
                type="number"
                min={1}
                max={720}
                value={form.partnerAskSlaHours}
                onChange={(event) =>
                  updateField(
                    "partnerAskSlaHours",
                    Number.parseInt(event.target.value, 10) || 48
                  )
                }
              />
            </label>
            <p className="setup-hint">
              Email rules boost partner messages on My Priorities. Separate multiple values with commas.
            </p>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="setup-section">
            <label className="setup-label">
              Ollama URL (optional)
              <input
                className="setup-input"
                value={form.ollamaBaseUrl}
                onChange={(event) => updateField("ollamaBaseUrl", event.target.value)}
                placeholder="http://127.0.0.1:11434"
              />
            </label>
            <label className="setup-label">
              Ollama model
              <input
                className="setup-input"
                value={form.ollamaModel}
                onChange={(event) => updateField("ollamaModel", event.target.value)}
                placeholder="llama3.1:8b"
              />
            </label>
            <div className="setup-checks">
              <label className="setup-check">
                <input
                  type="checkbox"
                  checked={form.allowOllamaSummaries}
                  onChange={(event) =>
                    updateField("allowOllamaSummaries", event.target.checked)
                  }
                />
                Enable Ollama summaries on dashboard cards
              </label>
              <label className="setup-check">
                <input
                  type="checkbox"
                  checked={form.enableMeetingOllamaSummary}
                  onChange={(event) =>
                    updateField("enableMeetingOllamaSummary", event.target.checked)
                  }
                />
                Summarize meeting transcripts with Ollama
              </label>
              <label className="setup-check">
                <input
                  type="checkbox"
                  checked={form.enableIngestionPoll}
                  onChange={(event) =>
                    updateField("enableIngestionPoll", event.target.checked)
                  }
                />
                Auto-poll Webex and email imports in the background
              </label>
              <label className="setup-check">
                <input
                  type="checkbox"
                  checked={form.enableGongEmailCorrelation}
                  onChange={(event) =>
                    updateField("enableGongEmailCorrelation", event.target.checked)
                  }
                />
                Correlate Gong notification emails
              </label>
              <label className="setup-check">
                <input
                  type="checkbox"
                  checked={form.enableAppleMailImport}
                  onChange={(event) =>
                    updateField("enableAppleMailImport", event.target.checked)
                  }
                />
                Import from Apple Mail (Mac)
              </label>
              <label className="setup-check">
                <input
                  type="checkbox"
                  checked={form.enableAppleCalendarImport}
                  onChange={(event) =>
                    updateField("enableAppleCalendarImport", event.target.checked)
                  }
                />
                Import from Apple Calendar (Mac)
              </label>
            </div>
            {form.enableAppleCalendarImport ? (
              <label className="setup-label">
                Calendar names (optional)
                <input
                  className="setup-input"
                  value={form.appleCalendarNames}
                  onChange={(event) =>
                    updateField("appleCalendarNames", event.target.value)
                  }
                  placeholder="Calendar, Work"
                />
              </label>
            ) : null}
          </section>
        ) : null}

        {step === 3 ? (
          <section className="setup-section">
            <p className="setup-hint">
              Connect Webex to sync allowlisted spaces. OAuth integrations use short-lived access
              tokens with refresh tokens — follow the getting started guide so connectivity lasts
              beyond a single session.
            </p>
            <div className="setup-guide-links">
              <Link href="/docs/webex-getting-started" className="setup-link" target="_blank">
                Webex getting started guide
              </Link>
            </div>
            {webexConfigured ? (
              <div className="setup-webex-actions">
                <a
                  href="/api/integrations/webex/connect"
                  className="setup-button setup-button--primary"
                >
                  {webexConnected ? "Reconnect Webex" : "Connect Webex"}
                </a>
                {webexConnected ? (
                  <p className="setup-success">Webex connected. Finish setup to open your dashboard.</p>
                ) : null}
              </div>
            ) : (
              <p className="setup-hint">
                Save your Webex OAuth client ID and secret under{" "}
                <Link href="/settings/webex" className="setup-link">
                  Settings → Webex
                </Link>
                , then return here to connect.
              </p>
            )}
            {!draftReady ? (
              <p className="setup-hint">
                Complete the Partner step first so Webex can store tokens for your local profile.
              </p>
            ) : null}
          </section>
        ) : null}

        <footer className="setup-footer">
          {step > 0 ? (
            <button type="button" className="setup-button" onClick={goBack} disabled={busy}>
              Back
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="setup-button setup-button--primary"
            onClick={() => void goNext()}
            disabled={busy}
          >
            {step === STEPS.length - 1 ? (busy ? "Finishing…" : "Open dashboard") : "Continue"}
          </button>
        </footer>
      </div>
    </div>
  );
}
