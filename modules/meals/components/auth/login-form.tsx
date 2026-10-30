"use client";

import { useActionState } from "react";
import {
  envUserLoginAction,
  loginAction,
  type AuthActionResult,
} from "@meals/actions/auth";
import { Button } from "@meals/components/ui/button";
import { Input } from "@meals/components/ui/input";
import { Label } from "@meals/components/ui/label";

const initial: AuthActionResult = {};

export function LoginForm({
  initialError,
  quickUsers = [],
  showPasswordForm = true,
}: {
  initialError?: string | null;
  /** Emails from AUTH_USERS for one-click login (local dev only) */
  quickUsers?: { email: string; label: string }[];
  showPasswordForm?: boolean;
}) {
  const [state, formAction, pending] = useActionState(loginAction, initial);
  const [quickState, quickAction, quickPending] = useActionState(
    envUserLoginAction,
    initial,
  );

  const error = state.error ?? quickState.error ?? initialError;

  return (
    <div className="space-y-4">
      {error ? (
        <p
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {quickUsers.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Choose who is signing in</p>
          <ul className="space-y-2">
            {quickUsers.map((user) => (
              <li key={user.email}>
                <form action={quickAction}>
                  <input type="hidden" name="email" value={user.email} />
                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={pending || quickPending}
                  >
                    {quickPending ? "Signing in…" : user.label}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {showPasswordForm ? (
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="min-h-12"
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="min-h-12"
            />
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
