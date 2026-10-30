import type { ReactNode } from "react";
import { APP_NAME } from "@meals/lib/brand";

/** Quiet frame for forgot/reset password flows. */
export function AuthSimpleFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-3 py-8 min-[400px]:px-4 min-[400px]:py-10">
      <div className="auth-ambient" aria-hidden />
      <div className="relative z-10 w-full max-w-md">
        <p className="font-display mb-6 block text-center text-2xl font-semibold text-primary min-[400px]:mb-8 min-[400px]:text-3xl">
          {APP_NAME}
        </p>
        <div className="rounded-2xl border border-border/80 bg-card/90 p-4 shadow-sm backdrop-blur-sm min-[400px]:p-6">
          <h1 className="font-display text-xl font-semibold min-[400px]:text-2xl">
            {title}
          </h1>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">{description}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
