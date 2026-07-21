import { getAuthSession } from "@/lib/auth";
import { AppConfigEditor } from "@/components/app-config-editor";
import { OllamaPreferenceToggle } from "@/components/ollama-preference-toggle";
import { SettingsPanel } from "@/components/settings-panel";
import { ThemePreferenceControl } from "@/components/theme-preference-control";
import { getUserPreferences } from "@/lib/user/preferences";

export default async function PreferencesSettingsPage() {
  const session = await getAuthSession();
  if (!session) return null;

  const preferences = await getUserPreferences(session.userId);

  return (
    <>
      <SettingsPanel title="Appearance">
        <ThemePreferenceControl />
      </SettingsPanel>

      <SettingsPanel title="App configuration">
        <AppConfigEditor />
      </SettingsPanel>

      <SettingsPanel title="Local AI summaries">
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.875rem",
            marginBottom: "1rem",
            lineHeight: 1.5,
          }}
        >
          Personal setting for {session.name ?? session.email}. When enabled, My
          Priorities may call your configured Ollama instance for richer card summaries.
        </p>
        <OllamaPreferenceToggle
          enabled={preferences.allowOllamaSummaries}
          available={preferences.ollamaAvailable}
        />
      </SettingsPanel>
    </>
  );
}
