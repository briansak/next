"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ThemePreferenceControl } from "./theme-preference-control";

const SETTINGS_LINKS = [
  { href: "/settings/webex", label: "Webex & sync" },
  { href: "/settings/email", label: "Email & calendar" },
  { href: "/settings/preferences", label: "All preferences" },
] as const;

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label="Settings"
        title="Settings"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          borderRadius: 8,
          color: open ? "var(--text)" : "var(--text-muted)",
          border: open ? "1px solid var(--border)" : "1px solid transparent",
          background: open ? "var(--surface-raised)" : "transparent",
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 0.4rem)",
            right: 0,
            width: 240,
            padding: "0.75rem",
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            boxShadow: "var(--shadow-md)",
            zIndex: 40,
          }}
        >
          <p
            style={{
              fontSize: "0.72rem",
              fontWeight: 600,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: "0.45rem",
            }}
          >
            Appearance
          </p>
          <ThemePreferenceControl compact />

          <div
            style={{
              height: 1,
              background: "var(--border)",
              margin: "0.75rem 0",
            }}
          />

          <p
            style={{
              fontSize: "0.72rem",
              fontWeight: 600,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: "0.35rem",
            }}
          >
            Settings
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {SETTINGS_LINKS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  style={{
                    display: "block",
                    padding: "0.45rem 0.35rem",
                    borderRadius: 6,
                    fontSize: "0.85rem",
                    color: "var(--text)",
                  }}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
