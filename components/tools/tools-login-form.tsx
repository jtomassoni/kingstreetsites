"use client";

import { useActionState } from "react";
import {
  toolsEasyLoginAction,
  toolsLoginAction,
  type ToolsAuthActionResult,
} from "@/lib/tools/auth/actions";

const initial: ToolsAuthActionResult = {};

export function ToolsLoginForm({
  nextPath,
  initialError,
  quickUsers = [],
}: {
  nextPath: string;
  initialError?: string | null;
  quickUsers?: { email: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(toolsLoginAction, initial);
  const [quickState, quickAction, quickPending] = useActionState(
    toolsEasyLoginAction,
    initial,
  );

  const error = state.error ?? quickState.error ?? initialError;

  return (
    <div className="space-y-4">
      {error ? (
        <p
          className="rounded-xl border border-accent-rose/30 bg-accent-rose/10 px-3 py-2 text-sm text-accent-rose"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {quickUsers.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-ink-muted">Choose who is signing in</p>
          <ul className="space-y-2">
            {quickUsers.map((user) => (
              <li key={user.email}>
                <form action={quickAction}>
                  <input type="hidden" name="email" value={user.email} />
                  <input type="hidden" name="next" value={nextPath} />
                  <button
                    type="submit"
                    disabled={pending || quickPending}
                    className="w-full rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-cream hover:bg-ink/90 disabled:opacity-50"
                  >
                    {quickPending ? "Signing in…" : user.label}
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <div className="relative py-2 text-center text-xs uppercase tracking-wide text-ink-faint">
            <span className="bg-white px-2">or use password</span>
          </div>
        </div>
      ) : null}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={nextPath} />
        <div>
          <label
            htmlFor="tools-email"
            className="mb-1.5 block text-sm font-medium text-ink-muted"
          >
            Email
          </label>
          <input
            id="tools-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={pending}
            className="w-full rounded-xl border border-ink/10 bg-cream px-4 py-3 text-ink placeholder:text-ink-faint focus:border-brand/30 focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-50"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label
            htmlFor="tools-password"
            className="mb-1.5 block text-sm font-medium text-ink-muted"
          >
            Password
          </label>
          <input
            id="tools-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={pending}
            className="w-full rounded-xl border border-ink/10 bg-cream px-4 py-3 text-ink placeholder:text-ink-faint focus:border-brand/30 focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
