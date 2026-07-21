export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { migrateSecretsFromEnv } = await import("./lib/secrets/store");
      await migrateSecretsFromEnv();
      const { startIngestionPoller } = await import("./lib/ingestion/poll");
      await startIngestionPoller();
    } catch (error) {
      const { handleSchemaMismatch } = await import("./lib/db/schema-mismatch");
      handleSchemaMismatch("instrumentation", error, undefined);
    }
  }
}
