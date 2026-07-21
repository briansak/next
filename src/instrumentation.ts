export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startIngestionPoller } = await import("./lib/ingestion/poll");
    await startIngestionPoller();
  }
}
