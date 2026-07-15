import {
  ingestionPollEnabled,
  runIngestionPoll,
  startIngestionPoller,
} from "@/lib/ingestion/poll";

const watch = process.argv.includes("--watch");

async function main() {
  if (!ingestionPollEnabled()) {
    console.error("Set ENABLE_INGESTION_POLL=true in .env");
    process.exit(1);
  }

  if (watch) {
    startIngestionPoller();
    return;
  }

  const result = await runIngestionPoll();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
