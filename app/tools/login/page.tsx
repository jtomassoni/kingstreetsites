import Link from "next/link";
import { ToolsLoginForm } from "@/components/tools/tools-login-form";
import { isEasyLoginEnabled } from "@meals/lib/auth/easy-login";
import {
  getSignInUsers,
  isToolsAuthConfigured,
  isSuperAdmin,
} from "@/lib/tools/auth/roles";
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
      ? "Login is not configured. Set SUPER_ADMIN_USERS, APP_USERS, and TOOLS_SESSION_SECRET."
      : params.error === "unauthorized"
        ? "Your account is no longer authorized."
        : null;

  const quickUsers =
    configured && isEasyLoginEnabled()
      ? getSignInUsers().map((u) => ({
          email: u.email,
          label: `${u.email.split("@")[0] || u.email}${
            isSuperAdmin(u.email) ? " (super admin)" : " (app user)"
          }`,
        }))
      : [];

  return (
    <main className="flex min-h-dvh flex-col bg-cream">
      <header className="px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:py-6">
        <Link href="/" className="inline-flex items-center gap-2.5 text-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink font-serif text-base text-brand-light sm:h-9 sm:w-9 sm:text-lg">
            K
          </span>
          <span className="font-semibold tracking-tight text-sm sm:text-base">
            King Street Sites
          </span>
        </Link>
      </header>

      <div className="flex flex-1 items-start justify-center px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 sm:items-center sm:px-6 sm:pb-16 sm:pt-0">
        <div className="w-full max-w-sm">
          <h1 className="text-center font-serif text-[1.75rem] tracking-tight text-ink sm:text-3xl">
            Sign in
          </h1>
          <p className="mt-2 text-center text-sm text-ink-muted">
            Opens the app dashboard for James and Mary
          </p>

          <div className="mt-6 rounded-2xl border border-ink/[0.06] bg-white p-5 shadow-card sm:mt-8 sm:p-6">
            {!configured ? (
              <p className="text-sm text-ink-muted" role="alert">
                Login is not configured. Add{" "}
                <code className="rounded bg-cream px-1">SUPER_ADMIN_USERS</code>,{" "}
                <code className="rounded bg-cream px-1">APP_USERS</code>, and{" "}
                <code className="rounded bg-cream px-1">TOOLS_SESSION_SECRET</code>{" "}
                (see docs/TOOLS.md).
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
