const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "Only admins can connect integrations.",
  webex_not_configured: "Webex is not configured. Check WEBEX_CLIENT_ID and WEBEX_CLIENT_SECRET in .env.",
  webex_auth_denied: "Webex authorization was denied or cancelled.",
  webex_invalid_scope:
    "Webex rejected the requested scopes. Enable the matching scopes on your integration at developer.webex.com, then set WEBEX_SCOPE_MODE or WEBEX_SCOPES in .env to match exactly.",
};

const SUCCESS_MESSAGES: Record<string, string> = {
  webex: "Webex connected successfully. Run Sync now to pull messages and meetings.",
};

export function IngestionAlerts({
  error,
  connected,
  detail,
}: {
  error?: string;
  connected?: string;
  detail?: string;
}) {
  const errorMsg = error ? ERROR_MESSAGES[error] ?? `Error: ${error}` : null;
  const successMsg = connected ? SUCCESS_MESSAGES[connected] ?? "Connected." : null;

  if (!errorMsg && !successMsg) return null;

  return (
    <div style={{ marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {errorMsg && (
        <p
          style={{
            background: "rgba(239, 91, 91, 0.1)",
            border: "1px solid var(--critical)",
            color: "var(--critical)",
            padding: "0.75rem 1rem",
            borderRadius: 8,
            fontSize: "0.875rem",
          }}
        >
          {errorMsg}
          {detail && (
            <span style={{ display: "block", marginTop: "0.25rem", opacity: 0.9 }}>
              {decodeURIComponent(detail)}
            </span>
          )}
        </p>
      )}
      {successMsg && (
        <p
          style={{
            background: "rgba(91, 239, 168, 0.1)",
            border: "1px solid var(--low)",
            color: "var(--low)",
            padding: "0.75rem 1rem",
            borderRadius: 8,
            fontSize: "0.875rem",
          }}
        >
          {successMsg}
        </p>
      )}
    </div>
  );
}

export function OAuthConnectLink({
  href,
  label,
  secondary,
}: {
  href: string;
  label: string;
  secondary?: boolean;
}) {
  // Must use <a>, not Next.js Link — OAuth requires a full page navigation
  // to follow the external redirect to webexapis.com.
  return (
    <a
      href={href}
      style={{
        display: "inline-block",
        background: secondary ? "transparent" : "var(--accent)",
        color: secondary ? "var(--text)" : "#fff",
        border: secondary ? "1px solid var(--border)" : "none",
        padding: "0.5rem 1rem",
        borderRadius: 8,
        fontSize: "0.875rem",
        fontWeight: 500,
        textDecoration: "none",
      }}
    >
      {label}
    </a>
  );
}
