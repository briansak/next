import { THEME_INIT_SCRIPT } from "@/lib/theme";

export function ThemeScript() {
  return (
    <script
      id="theme-init"
      dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
    />
  );
}
