import { redirect } from "next/navigation";

/**
 * Canonical sign-in is the household tools login, which always lands on
 * the choose-an-app dashboard at /tools. CRM is only for SUPER_ADMIN_USERS.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  // Never send people into CRM via legacy /login?next=/admin — dashboard first.
  if (params.next?.startsWith("/tools")) qs.set("next", params.next);
  if (params.error) qs.set("error", params.error);
  const suffix = qs.toString() ? `?${qs}` : "";
  redirect(`/tools/login${suffix}`);
}
