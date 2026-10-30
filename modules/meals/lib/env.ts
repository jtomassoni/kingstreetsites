import { z } from "zod";
import { envAuthEmails, mealsAuthUsersRaw } from "@meals/lib/auth/env-users";
import {
  DEFAULT_INTERNAL_STOP_USD,
  DEFAULT_LIFETIME_BUDGET_USD,
  DEFAULT_MAX_REQUESTS_PER_USER_PER_DAY,
  parseBudgetConfig,
  type BudgetConfig,
} from "@meals/lib/ai/budget";
import { mealsDatabaseUrl } from "@/lib/tools/auth/provision";

const serverSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    DATABASE_URL_UNPOOLED: z.string().optional().default(""),
    AUTH_USERS: z.string().min(1),
    DEFAULT_HOUSEHOLD_NAME: z.string().default("JT and Mary"),
    SESSION_SECRET: z.string().min(16),
    OPENAI_API_KEY: z.string().optional().default(""),
    OPENAI_MODEL: z.string().default("gpt-5.4-mini"),
    OPENAI_LIFETIME_BUDGET_USD: z
      .string()
      .optional()
      .default(String(DEFAULT_LIFETIME_BUDGET_USD)),
    OPENAI_INTERNAL_STOP_USD: z
      .string()
      .optional()
      .default(String(DEFAULT_INTERNAL_STOP_USD)),
    OPENAI_MAX_REQUESTS_PER_USER_PER_DAY: z
      .string()
      .optional()
      .default(String(DEFAULT_MAX_REQUESTS_PER_USER_PER_DAY)),
    SUPER_ADMIN_EMAIL: z.string().optional().default(""),
    APP_URL: z.string().url().default("http://localhost:3000"),
    ALLOWED_EMAILS: z.string().optional().default(""),
  })
  .superRefine((data, ctx) => {
    if (envAuthEmails(data.AUTH_USERS).length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_USERS"],
        message: "Set TOOLS_AUTH_USERS=email:password,email:password",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverSchema> & {
  ALLOWED_EMAILS: string;
};

let cached: ServerEnv | null = null;

function resolveMealsDbUrl(): string | undefined {
  return mealsDatabaseUrl();
}

function resolveSessionSecret(): string {
  return (
    process.env.TOOLS_SESSION_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    ""
  );
}

export function getEnv(): ServerEnv {
  if (cached) {
    return {
      ...cached,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY?.trim() ?? "",
      OPENAI_MODEL: process.env.OPENAI_MODEL?.trim() || cached.OPENAI_MODEL,
      OPENAI_LIFETIME_BUDGET_USD:
        process.env.OPENAI_LIFETIME_BUDGET_USD?.trim() ||
        cached.OPENAI_LIFETIME_BUDGET_USD,
      OPENAI_INTERNAL_STOP_USD:
        process.env.OPENAI_INTERNAL_STOP_USD?.trim() ||
        cached.OPENAI_INTERNAL_STOP_USD,
      OPENAI_MAX_REQUESTS_PER_USER_PER_DAY:
        process.env.OPENAI_MAX_REQUESTS_PER_USER_PER_DAY?.trim() ||
        cached.OPENAI_MAX_REQUESTS_PER_USER_PER_DAY,
      SUPER_ADMIN_EMAIL:
        process.env.SUPER_ADMIN_EMAIL?.trim() || cached.SUPER_ADMIN_EMAIL,
    };
  }

  const parsed = serverSchema.safeParse({
    DATABASE_URL: resolveMealsDbUrl(),
    DATABASE_URL_UNPOOLED:
      process.env.MEALS_DATABASE_URL_UNPOOLED ||
      process.env.DATABASE_URL_UNPOOLED,
    AUTH_USERS: mealsAuthUsersRaw(),
    DEFAULT_HOUSEHOLD_NAME: process.env.DEFAULT_HOUSEHOLD_NAME,
    SESSION_SECRET: resolveSessionSecret(),
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_LIFETIME_BUDGET_USD: process.env.OPENAI_LIFETIME_BUDGET_USD,
    OPENAI_INTERNAL_STOP_USD: process.env.OPENAI_INTERNAL_STOP_USD,
    OPENAI_MAX_REQUESTS_PER_USER_PER_DAY:
      process.env.OPENAI_MAX_REQUESTS_PER_USER_PER_DAY,
    SUPER_ADMIN_EMAIL: process.env.SUPER_ADMIN_EMAIL,
    APP_URL: process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL,
    ALLOWED_EMAILS: process.env.ALLOWED_EMAILS,
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid meal planner configuration: ${details}`);
  }

  const authEmails = envAuthEmails(parsed.data.AUTH_USERS);
  cached = {
    ...parsed.data,
    ALLOWED_EMAILS: [
      ...new Set([
        ...authEmails,
        ...parsed.data.ALLOWED_EMAILS.split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      ]),
    ].join(","),
  };
  return cached;
}

export function getEnvSafe(): ServerEnv | null {
  try {
    return getEnv();
  } catch {
    return null;
  }
}

export function isAiEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function getAiBudgetConfig(): BudgetConfig {
  const env = getEnvSafe();
  return parseBudgetConfig({
    OPENAI_LIFETIME_BUDGET_USD:
      process.env.OPENAI_LIFETIME_BUDGET_USD ?? env?.OPENAI_LIFETIME_BUDGET_USD,
    OPENAI_INTERNAL_STOP_USD:
      process.env.OPENAI_INTERNAL_STOP_USD ?? env?.OPENAI_INTERNAL_STOP_USD,
    OPENAI_MAX_REQUESTS_PER_USER_PER_DAY:
      process.env.OPENAI_MAX_REQUESTS_PER_USER_PER_DAY ??
      env?.OPENAI_MAX_REQUESTS_PER_USER_PER_DAY,
  });
}
