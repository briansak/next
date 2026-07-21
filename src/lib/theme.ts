export const THEME_STORAGE_KEY = "next-color-scheme";

export type ColorSchemePreference = "light" | "dark" | "system";
export type ResolvedColorScheme = "light" | "dark";

export const COLOR_SCHEME_OPTIONS: Array<{
  value: ColorSchemePreference;
  label: string;
}> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function isColorSchemePreference(value: unknown): value is ColorSchemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function readStoredColorSchemePreference(): ColorSchemePreference {
  if (typeof window === "undefined") return "dark";

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isColorSchemePreference(stored)) return stored;
  } catch {
    /* ignore */
  }

  return "dark";
}

export function resolveColorScheme(
  preference: ColorSchemePreference,
  prefersDark = false
): ResolvedColorScheme {
  if (preference === "system") {
    return prefersDark ? "dark" : "light";
  }

  return preference;
}

export function applyResolvedColorScheme(theme: ResolvedColorScheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}

export function applyColorSchemePreference(preference: ColorSchemePreference): ResolvedColorScheme {
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = resolveColorScheme(preference, prefersDark);
  applyResolvedColorScheme(theme);
  return theme;
}

export function storeColorSchemePreference(preference: ColorSchemePreference): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* ignore */
  }

  applyColorSchemePreference(preference);
}

export const THEME_INIT_SCRIPT = `(function(){try{var key=${JSON.stringify(THEME_STORAGE_KEY)};var stored=localStorage.getItem(key);var preference=(stored==="light"||stored==="dark"||stored==="system")?stored:"dark";var theme=preference==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):preference;document.documentElement.dataset.theme=theme;}catch(e){document.documentElement.dataset.theme="dark";}})();`;
