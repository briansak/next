import { describe, expect, it } from "vitest";
import {
  isColorSchemePreference,
  resolveColorScheme,
  THEME_STORAGE_KEY,
} from "./theme";

describe("theme", () => {
  it("validates stored preferences", () => {
    expect(isColorSchemePreference("light")).toBe(true);
    expect(isColorSchemePreference("dark")).toBe(true);
    expect(isColorSchemePreference("system")).toBe(true);
    expect(isColorSchemePreference("sepia")).toBe(false);
  });

  it("resolves system preference", () => {
    expect(resolveColorScheme("system", true)).toBe("dark");
    expect(resolveColorScheme("system", false)).toBe("light");
    expect(resolveColorScheme("light", true)).toBe("light");
  });

  it("uses a stable storage key", () => {
    expect(THEME_STORAGE_KEY).toBe("next-color-scheme");
  });
});
