# Household tools

Private dashboard for James and Mary at `/tools`. Separate from the public King Street Sites site and the business CRM at `/admin`.

## Local setup

1. Copy `.env.example` → `.env.local` (or extend your existing `.env`).
2. Set tools auth (never commit real values):

```bash
TOOLS_AUTH_USERS=james@example.com:password,mary@example.com:password
TOOLS_SESSION_SECRET=$(openssl rand -base64 32)
```

3. Point meals at the **existing Meal Planner Neon database** (not the CRM `DATABASE_URL`):

```bash
MEALS_DATABASE_URL=postgresql://…-pooler…/neondb?sslmode=require
MEALS_DATABASE_URL_UNPOOLED=postgresql://…/neondb?sslmode=require
DEFAULT_HOUSEHOLD_NAME=JT and Mary
```

4. Optional: `OPENAI_API_KEY` for meal AI; Upstash/KV Redis for arcade shared scores.
5. `npm install && npm run dev` → [http://localhost:3000/tools](http://localhost:3000/tools)

### Auth transition from Meal Planner

| Meal Planner | Tools (preferred) | Notes |
|---|---|---|
| `AUTH_USERS` | `TOOLS_AUTH_USERS` | Same `email:password,…` format; `AUTH_USERS` still accepted as fallback |
| `SESSION_SECRET` | `TOOLS_SESSION_SECRET` | Cookie is now `kss_tools_session` (old `mealplan_session` is not read) |
| `DATABASE_URL` | `MEALS_DATABASE_URL` | Keeps CRM and meals databases isolated |

Sign in again after deploy so sessions use the new cookie. Rotate `TOOLS_SESSION_SECRET` to invalidate all tools sessions. Rotate passwords by editing `TOOLS_AUTH_USERS` — removed users lose access on the next request (allowlist re-checked).

Business admin continues to use `ADMIN_EMAIL` / `ADMIN_PASSWORD` + next-auth. A tools session does **not** unlock `/admin`.

## Module structure

```
app/tools/                 # Thin routes + dashboard/login
app/api/tools/             # Tool APIs (arcade board, …)
components/tools/          # Shared tools chrome / login UI
lib/tools/
  registry.ts              # Typed tool registry (cards + nav)
  auth/                    # Session cookie, allowlist, rate limit
modules/meals/             # Meal Planner business logic + UI
modules/arcade/            # Hold the Lane game
db/meals/migrations/       # Meal Planner SQL (reference / migrate:meals)
docs/TOOLS.md              # This file
```

Dashboard cards and the tools nav are generated from `lib/tools/registry.ts` only.

## Adding a fourth tool

1. Add a module under `modules/<id>/` with the tool’s logic.
2. Register it in `lib/tools/registry.ts` (`id`, `title`, `description`, `icon`, `href`, `access`, `implemented`).
3. Add a thin route at `app/tools/<id>/…` that calls `requireToolsUser()` (and any tool-specific checks).
4. Put APIs under `app/api/tools/<id>/…` and enforce auth on the server (middleware + handler).
5. Extend the matcher in `middleware.ts` only if you add paths outside `/tools` and `/api/tools`.

No other navigation lists need editing.

## Database & deployment

- **CRM** (`DATABASE_URL`): unchanged. Do not run meals migrations against it.
- **Meals** (`MEALS_DATABASE_URL`): reuse the existing Meal Planner Neon project so household/profile IDs stay valid. Migrations live in `db/meals/migrations/`. Apply with `npm run migrate:meals` only when you intend to migrate that database; the script skips already-applied files and does not reset or seed.
- **Arcade scores**: local `.data/board.json`, or Upstash/Vercel KV via `UPSTASH_REDIS_*` / `KV_REST_API_*`.
- **Movie List**: source repo had no app code — `/tools/movies` is an authenticated stub until you implement `modules/movies`.

Deploy on the existing Vercel project by adding the new env vars. Keep the Meal Planner and Shoot ’Em Up deployments running until you cut over DNS/bookmarks. Do not delete source project folders or production databases as part of this merge.

### Suggested cutover

1. Merge `tools-integration` after review.
2. Set env vars on Vercel (tools auth + `MEALS_DATABASE_URL` + optional Redis/OpenAI).
3. Smoke-test `/tools`, meals flows, arcade, and confirm `/` + `/admin` still work.
4. Point bookmarks to `/tools/…`; retire standalone Meal Planner / arcade hosts when ready.

## Rollback

1. Revert or undeploy the `tools-integration` branch on Vercel.
2. Standalone `mealplanner` and `shootemup` apps/databases remain untouched.
3. CRM data is unaffected (separate database and next-auth cookies).

## Limitations

- Movie List has no product implementation yet.
- Login rate limiting is in-memory per server instance.
- Arcade device-name score claims are unchanged; tools login gates access to the game, not gamertag ownership.
- Meal photo uploads remain disabled until storage is chosen (same as Meal Planner).
