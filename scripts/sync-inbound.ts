import { syncReceivedEmails } from "../lib/inbound-email";

async function main() {
  const result = await syncReceivedEmails({ limit: 40 });
  console.log(
    JSON.stringify(
      {
        imported: result.imported,
        duplicate: result.duplicate,
        skipped: result.skipped,
        details: result.details,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
