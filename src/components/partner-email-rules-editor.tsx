"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type PartnerRuleKind = "domain" | "subjectPrefix" | "address";

interface PartnerRuleRow {
  id: string;
  fromDomain: string | null;
  fromAddress: string | null;
  subjectPrefix: string | null;
  label: string;
}

interface PartnerEmailRulesEditorProps {
  isAdmin: boolean;
  policyActive: boolean;
  initialPartnerName: string | null;
}

export function PartnerEmailRulesEditor({
  isAdmin,
  policyActive,
  initialPartnerName,
}: PartnerEmailRulesEditorProps) {
  const router = useRouter();
  const [rules, setRules] = useState<PartnerRuleRow[]>([]);
  const [policyStatus, setPolicyStatus] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState(initialPartnerName ?? "");
  const [ruleKind, setRuleKind] = useState<PartnerRuleKind>("domain");
  const [ruleValue, setRuleValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    const res = await fetch("/api/integrations/email/allowlist");
    if (!res.ok) return;
    const data = await res.json();
    setRules(data.rules ?? []);
    setPolicyStatus(data.status ?? null);
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  async function savePartnerName() {
    if (!isAdmin) return;
    setBusy(true);
    setError(null);
    setSavedMessage(null);
    try {
      const res = await fetch("/api/integrations/partner", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: partnerName.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save partner name");
        return;
      }
      setSavedMessage("Partner name saved.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function addRule(event: React.FormEvent) {
    event.preventDefault();
    if (!isAdmin) return;
    setBusy(true);
    setError(null);
    setSavedMessage(null);
    try {
      const res = await fetch("/api/integrations/email/allowlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: ruleKind, value: ruleValue }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not add partner rule");
        return;
      }
      setRuleValue("");
      setSavedMessage("Partner rule added.");
      await loadRules();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeRule(ruleId: string) {
    if (!isAdmin) return;
    setBusy(true);
    setError(null);
    setSavedMessage(null);
    try {
      const res = await fetch(
        `/api/integrations/email/allowlist?id=${encodeURIComponent(ruleId)}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not remove partner rule");
        return;
      }
      await loadRules();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const rulePlaceholder =
    ruleKind === "domain"
      ? "acme.com"
      : ruleKind === "subjectPrefix"
        ? "[ACME]"
        : "contact@acme.com";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <p
        style={{
          color: "var(--text-muted)",
          fontSize: "0.875rem",
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        Configure the partner organization and email signals that matter to your team.
        Matching messages get a priority boost on My Priorities and show up in partner
        asks. These rules do not block ingestion.
      </p>

      <div>
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.35rem",
            fontSize: "0.8rem",
            color: "var(--text-muted)",
          }}
        >
          Partner organization
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input
              type="text"
              value={partnerName}
              disabled={!isAdmin || busy}
              onChange={(event) => setPartnerName(event.target.value)}
              placeholder="e.g. Acme Partners"
              style={{
                flex: "1 1 220px",
                minWidth: 0,
                padding: "0.45rem 0.6rem",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text)",
              }}
            />
            {isAdmin ? (
              <button
                type="button"
                disabled={busy || partnerName.trim().length < 2}
                onClick={savePartnerName}
                style={{
                  padding: "0.45rem 0.75rem",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface-raised)",
                  color: "var(--text)",
                  fontSize: "0.8rem",
                }}
              >
                Save name
              </button>
            ) : null}
          </div>
        </label>
      </div>

      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.5rem",
          }}
        >
          <h3 style={{ fontSize: "0.875rem", fontWeight: 600, margin: 0 }}>
            Email & calendar rules
          </h3>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Policy: {policyStatus ?? "none"} · Rules: {rules.length}
            {!policyActive ? " · activate policy to import" : ""}
          </span>
        </div>

        {rules.length > 0 ? (
          <ul
            style={{
              listStyle: "none",
              margin: "0 0 0.75rem",
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: "0.4rem",
            }}
          >
            {rules.map((rule) => (
              <li
                key={rule.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.45rem 0.6rem",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  fontSize: "0.85rem",
                }}
              >
                <span>{rule.label}</span>
                {isAdmin ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => removeRule(rule.id)}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "var(--accent)",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                    }}
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", margin: "0 0 0.75rem" }}>
            No partner rules yet. Add a domain, subject prefix, or sender address below.
          </p>
        )}

        {isAdmin ? (
          <form onSubmit={addRule} style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            <select
              value={ruleKind}
              disabled={busy}
              onChange={(event) => setRuleKind(event.target.value as PartnerRuleKind)}
              style={{
                padding: "0.45rem 0.6rem",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: "0.8rem",
              }}
            >
              <option value="domain">Email domain</option>
              <option value="subjectPrefix">Subject prefix</option>
              <option value="address">Sender address</option>
            </select>
            <input
              type="text"
              value={ruleValue}
              disabled={busy}
              onChange={(event) => setRuleValue(event.target.value)}
              placeholder={rulePlaceholder}
              style={{
                flex: "1 1 180px",
                minWidth: 0,
                padding: "0.45rem 0.6rem",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text)",
              }}
            />
            <button
              type="submit"
              disabled={busy || ruleValue.trim().length === 0}
              style={{
                padding: "0.45rem 0.75rem",
                borderRadius: 8,
                border: "none",
                background: "var(--accent)",
                color: "#fff",
                fontSize: "0.8rem",
                fontWeight: 600,
              }}
            >
              Add rule
            </button>
          </form>
        ) : (
          <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", margin: 0 }}>
            Only admins can edit partner rules.
          </p>
        )}
      </div>

      {savedMessage ? (
        <p style={{ color: "var(--low)", fontSize: "0.8rem", margin: 0 }}>{savedMessage}</p>
      ) : null}
      {error ? (
        <p style={{ color: "var(--critical)", fontSize: "0.8rem", margin: 0 }}>{error}</p>
      ) : null}
    </div>
  );
}
