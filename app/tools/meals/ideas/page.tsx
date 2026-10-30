import { IdeasCapture } from "@meals/components/ideas/ideas-capture";
import { isAiEnabled } from "@meals/lib/env";

export default async function IdeasPage() {
  const aiEnabled = isAiEnabled();

  return <IdeasCapture aiEnabled={aiEnabled} />;
}
