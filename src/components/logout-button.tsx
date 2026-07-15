"use client";

export function LogoutButton() {
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <button
      onClick={handleLogout}
      style={{
        background: "transparent",
        border: "1px solid var(--border)",
        color: "var(--text-muted)",
        padding: "0.25rem 0.75rem",
        borderRadius: 6,
        fontSize: "0.8rem",
      }}
    >
      Sign out
    </button>
  );
}
