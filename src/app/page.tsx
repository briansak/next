import Link from "next/link";

export default function HomePage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "4rem 1.5rem",
      }}
    >
      <header style={{ marginBottom: "3rem" }}>
        <h1 style={{ fontSize: "2.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
          Next
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "1.125rem" }}>
          Collect, summarize, and prioritize team communications — scoped to
          what you explicitly allow.
        </p>
      </header>

      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "1.5rem",
          marginBottom: "2rem",
        }}
      >
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>
          MVP scope
        </h2>
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <FeatureItem label="Webex Spaces" detail="Allowlisted spaces only" />
          <FeatureItem label="Email" detail="Shared mailboxes with sender/domain filters" />
          <FeatureItem label="Heuristics" detail="Local priority scoring, optional Ollama" />
          <FeatureItem label="Multi-tenant" detail="Teams collaborate on next steps per partner" />
        </ul>
      </section>

      <section style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <Link
          href="/login"
          style={{
            background: "var(--accent)",
            color: "#fff",
            padding: "0.625rem 1.25rem",
            borderRadius: 8,
            fontWeight: 500,
          }}
        >
          Sign in
        </Link>
        <Link
          href="/register"
          style={{
            border: "1px solid var(--border)",
            color: "var(--text)",
            padding: "0.625rem 1.25rem",
            borderRadius: 8,
          }}
        >
          Register
        </Link>
        <Link
          href="/dashboard"
          style={{
            border: "1px solid var(--border)",
            color: "var(--text-muted)",
            padding: "0.625rem 1.25rem",
            borderRadius: 8,
            fontSize: "0.875rem",
          }}
        >
          My Priorities
        </Link>
      </section>
    </main>
  );
}

function FeatureItem({ label, detail }: { label: string; detail: string }) {
  return (
    <li style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
      <span>{label}</span>
      <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>{detail}</span>
    </li>
  );
}
