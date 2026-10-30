import Link from "next/link";
import { ToolsLoginForm } from "@/components/tools/tools-login-form";
import { isEasyLoginEnabled } from "@meals/lib/auth/easy-login";
import { getToolsAuthUsers } from "@/lib/tools/auth/env-users";
import { isToolsAuthConfigured } from "@/lib/tools/auth/env-users";
import { safeToolsReturnPath } from "@/lib/tools/auth/safe-return";

export const metadata = {
  title: "Tools sign in — King Street Sites",
  robots: { index: false, follow: false },
};

export default async function ToolsLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const nextPath = safeToolsReturnPath(params.next);
  const configured = isToolsAuthConfigured();

  const errorMessage =
    params.error === "config"
      ? "Tools login is not configured. Set TOOLS_AUTH_USERS and TOOLS_SESSION_SECRET."
      : params.error === "unauthorized"
        ? "Your account is no longer authorized."
        : null;

  const quickUsers =
    configured && isEasyLoginEnabled()
      ? getToolsAuthUsers().map((u) => ({
          email: u.email,
          label: u.email.split("@")[0] || u.email,
        }))
      : [];

  return (
    <main className="flex min-h-screen flex-col bg-cream">
      <header className="section py-6">
        <Link href="/" className="inline-flex items-center gap-2.5 text-ink">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink font-serif text-lg text-brand-light">
            K
          </span>
          <span className="font-semibold tracking-tight">King Street Sites</span>
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-sm">
          <h1 className="text-center font-serif text-3xl tracking-tight text-ink">
            Household tools
          </h1>
          <p className="mt-2 text-center text-sm text-ink-muted">
            Private access for James and Mary
          </p>

          <div className="mt-8 rounded-2xl border border-ink/[0.06] bg-white p-6 shadow-card">
            {!configured ? (
              <p className="text-sm text-ink-muted" role="alert">
                Tools authentication is not configured. Add{" "}
                <code className="rounded bg-cream px-1">TOOLS_AUTH_USERS</code>{" "}
                and{" "}
                <code className="rounded bg-cream px-1">TOOLS_SESSION_SECRET</code>{" "}
                to your environment (see docs/TOOLS.md).
              </p>
            ) : (
              <ToolsLoginForm
                nextPath={nextPath}
                initialError={errorMessage}
                quickUsers={quickUsers}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
