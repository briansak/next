import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { SettingsNav } from "@/components/settings-nav";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAuthSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Settings</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
          {session.partnerName ?? session.partnerName} — ingestion and personal preferences
          for {session.name ?? session.email}
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(200px, 220px) minmax(0, 1fr)",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        <aside
          style={{
            position: "sticky",
            top: "1.5rem",
            alignSelf: "start",
          }}
        >
          <SettingsNav />
        </aside>

        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "1rem" }}>
          {children}
        </div>
      </div>
    </main>
  );
}
