export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ingestionPollEnabled, startIngestionPoller } = await import(
      "./lib/ingestion/poll"
    );
    if (ingestionPollEnabled()) {
      startIngestionPoller();
    }
  }
}
