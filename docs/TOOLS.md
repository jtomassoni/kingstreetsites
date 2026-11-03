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
modules/movies/            # Watching schedule (TV shows + MT air times)
modules/projects/          # House Projects (board + costs + comments)
modules/arcade/            # Hold the Lane game
db/meals/migrations/       # Meal Planner + watching + house projects SQL (migrate:meals)
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
- **Movie List / Watching** (`/tools/movies`): shared “when can we actually watch” calendar. Times are always stored and shown in **America/Denver** (Mountain Time). Adding a show requires a **streaming service** (Max, Disney+, Netflix, …) plus the real available night/time — network/TVMaze listings (e.g. Food Network `8/7c` → `6:00 PM` MT) are kept as reference only and **sync does not overwrite** stream overrides. Hulu titles are tagged **Disney+** (Disney Bundle / Hulu-in-Disney+). Shows without a next episode are labeled **Not airing** and drop off the week calendar. No AI key required. Tables live on the meals Neon DB (`watching_shows` + `watching_show_streams` via migrations `007`–`009`).
- **House Projects** (`/tools/projects`): shared board for big home projects (not chores). Hierarchy is **project → sub-project → line item**. Board groups are **Backlog / Planned / In progress / Blocked / Done** with manual priority within each group; archive soft-hides a project without deleting it. Projects have an optional budget; line items carry estimate + actual (integer cents) and optional assignee (`james` | `mary`). Comments work on projects, sub-projects, and line items. No AI key required. Tables live on the meals Neon DB (`house_projects`, `house_sub_projects`, `house_line_items`, `house_project_comments` via migration `010`).

On Vercel set `SUPER_ADMIN_USERS`, `APP_USERS`, `TOOLS_SESSION_SECRET`, and `MEALS_DATABASE_URL`. After deploy, run `npm run migrate:meals` if meals/watching/house-projects migrations are not applied yet.

## Rollback

1. Revert or undeploy the branch on Vercel.
2. Standalone `mealplanner` and `shootemup` apps/databases remain untouched.
3. CRM data is unaffected (separate database).

## Limitations

- Watching stream overrides are weekly night/time per service (not per-episode absolute drop timestamps).
- House Projects v1 has no photos/receipts, due dates, or notifications; assignees are line-item only.
- Login rate limiting is in-memory per server instance.
- Arcade device-name score claims are unchanged; tools login gates access to the game, not gamertag ownership.
- Meal photo uploads remain disabled until storage is chosen (same as Meal Planner).
