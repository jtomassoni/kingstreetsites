import { redirect } from "next/navigation";

/** Legacy /app routes → /admin */
export default async function LegacyAppRedirect({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path } = await params;
  const suffix = path?.length ? `/${path.join("/")}` : "/leads";
  redirect(`/admin${suffix}`);
}
