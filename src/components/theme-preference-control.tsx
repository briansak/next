"use client";

import { useEffect, useState } from "react";
import {
  applyColorSchemePreference,
  COLOR_SCHEME_OPTIONS,
  readStoredColorSchemePreference,
  storeColorSchemePreference,
  type ColorSchemePreference,
} from "@/lib/theme";

interface ThemePreferenceControlProps {
  compact?: boolean;
}

export function ThemePreferenceControl({ compact = false }: ThemePreferenceControlProps) {
  const [preference, setPreference] = useState<ColorSchemePreference>("dark");

  useEffect(() => {
    const stored = readStoredColorSchemePreference();
    setPreference(stored);
    applyColorSchemePreference(stored);
  }, []);

  useEffect(() => {
    if (preference !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => applyColorSchemePreference("system");

    syncSystemTheme();
    media.addEventListener("change", syncSystemTheme);
    return () => media.removeEventListener("change", syncSystemTheme);
  }, [preference]);

  function onSelect(next: ColorSchemePreference) {
    setPreference(next);
    storeColorSchemePreference(next);
  }

  return (
    <div>
      {!compact ? (
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.875rem",
            marginBottom: "0.75rem",
            lineHeight: 1.5,
          }}
        >
          Choose light or dark mode for this browser. Your choice is saved locally and
          applies across refreshes.
        </p>
      ) : null}
      <div
        role="radiogroup"
        aria-label="Color scheme"
        style={{
          display: "inline-flex",
          gap: "0.35rem",
          padding: "0.2rem",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--bg)",
        }}
      >
        {COLOR_SCHEME_OPTIONS.map((option) => {
          const active = preference === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(option.value)}
              style={{
                fontSize: compact ? "0.72rem" : "0.8rem",
                fontWeight: active ? 600 : 500,
                padding: compact ? "0.3rem 0.55rem" : "0.4rem 0.75rem",
                borderRadius: 6,
                border: "none",
                background: active ? "var(--surface-raised)" : "transparent",
                color: active ? "var(--text)" : "var(--text-muted)",
                boxShadow: active ? "inset 0 0 0 1px var(--border)" : "none",
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
