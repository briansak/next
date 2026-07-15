import Link from "next/link";
import { getAuthSession } from "@/lib/auth";
import { LogoutButton } from "./logout-button";
import { SettingsGearLink } from "./settings-gear-link";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getAuthSession();

  return (
    <>
      {session && (
        <nav
          style={{
            borderBottom: "1px solid var(--border)",
            background: "var(--surface)",
            padding: "0.75rem 1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
            <Link href="/dashboard" style={{ fontWeight: 600, color: "var(--text)" }}>
              Next
            </Link>
            <Link href="/dashboard" style={{ fontSize: "0.875rem" }}>
              My Priorities
            </Link>
            <Link href="/technologies" style={{ fontSize: "0.875rem" }}>
              Technologies
            </Link>
            <Link href="/internal-calls" style={{ fontSize: "0.875rem" }}>
              Internal Calls
            </Link>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem", fontSize: "0.875rem" }}>
            <span style={{ color: "var(--text-muted)" }}>
              {session.partnerName ?? session.tenantName}
            </span>
            <span>{session.email}</span>
            <SettingsGearLink />
            <LogoutButton />
          </div>
        </nav>
      )}
      {children}
    </>
  );
}
