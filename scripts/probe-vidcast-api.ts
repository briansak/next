import { prisma } from "../src/lib/db";
import { getWebexAccessToken } from "../src/lib/integrations/webex/ingest";
import {
  fetchVidcastShareContent,
  parseVidcastShareId,
} from "../src/lib/integrations/webex/vidcast-api";

async function main() {
  const shareUrl =
    process.argv[2] ??
    "https://app.vidcast.io/share/f91d1f86-a05b-494f-bde1-80cbe120a973";

  const shareId = parseVidcastShareId(shareUrl);
  if (!shareId) {
    console.error("Could not parse share id from:", shareUrl);
    process.exit(1);
  }

  const token = await getWebexAccessToken();
  if (!token) {
    console.log("No Webex token — reconnect Webex in Settings");
    return;
  }

  console.log("Share id:", shareId);
  const content = await fetchVidcastShareContent(token, shareUrl);
  console.log(JSON.stringify(content, null, 2));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
