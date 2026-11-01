# Household tools

Private app dashboard for James and Mary at `/tools`. Separate from the public King Street Sites site.

## Roles

| Role | Env var | Sees |
|---|---|---|
| **Super admin** (James) | `SUPER_ADMIN_USERS` | All household apps **and** Business CRM (`/admin`) |
| **App user** (Mary) | `APP_USERS` | All household apps **except** CRM |

Both sign in at `/tools/login` (or `/login`) and always land on **Choose an app**. CRM is a dashboard card for super admins only; app users hitting `/admin` are sent back to `/tools`.

## Local setup

1. Copy `.env.example` → `.env.local` (or extend your existing `.env`).
2. Set roles (never commit real values):

```bash
SUPER_ADMIN_USERS=james@example.com:password
APP_USERS=mary@example.com:password
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

### Auth transition / legacy names

| Legacy | Prefer | Notes |
|---|---|---|
| `TOOLS_AUTH_USERS` / `AUTH_USERS` | `SUPER_ADMIN_USERS` + `APP_USERS` | Still accepted as fallbacks |
| `CRM_AUTH_USERS` | `SUPER_ADMIN_USERS` | CRM access = super admin |
| `SESSION_SECRET` | `TOOLS_SESSION_SECRET` | Cookie is `kss_tools_session` |

Rotate `TOOLS_SESSION_SECRET` to invalidate sessions. Remove a user from the role lists to revoke access on the next request.

## Module structure

```
app/tools/                 # Thin routes + dashboard/login
app/api/tools/             # Tool APIs (arcade board, …)
components/tools/          # Shared tools chrome / login UI
lib/tools/
  registry.ts              # Typed tool registry (cards + nav)
  auth/                    # Session cookie, roles, rate limit
modules/meals/             # Meal Planner business logic + UI
modules/arcade/            # Hold the Lane game
db/meals/migrations/       # Meal Planner SQL (reference / migrate:meals)
docs/TOOLS.md              # This file
```

Dashboard cards and the tools nav are generated from `lib/tools/registry.ts` only. The CRM card is added for super admins in the dashboard page.

## Adding another tool

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
- **Movie List**: `/tools/movies` is an authenticated stub until you implement `modules/movies`.
- **House Projects**: `/tools/projects` is an authenticated stub for a future shared home to-do app (`modules/projects`).

On Vercel set `SUPER_ADMIN_USERS`, `APP_USERS`, `TOOLS_SESSION_SECRET`, and `MEALS_DATABASE_URL`.

## Rollback

1. Revert or undeploy the branch on Vercel.
2. Standalone `mealplanner` and `shootemup` apps/databases remain untouched.
3. CRM data is unaffected (separate database).

## Limitations

- Movie List and House Projects are stubs.
- Login rate limiting is in-memory per server instance.
- Arcade device-name score claims are unchanged; tools login gates access to the game, not gamertag ownership.
- Meal photo uploads remain disabled until storage is chosen (same as Meal Planner).
