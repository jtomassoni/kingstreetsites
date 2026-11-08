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
modules/restock/           # Restock Tracker (GameStop / Best Buy)
db/meals/migrations/       # Meal Planner + watching + house projects + restock SQL (migrate:meals)
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
- **Restock Tracker** (`/tools/restock-tracker`): watches nearby GameStop and Best Buy stores for the Zelda 40th Anniversary Switch 2. Defaults to ZIP `80219` and 30 miles. Vercel cron `*/5 * * * *` hits `/api/cron/restock-tracker` (Bearer `CRON_SECRET`). Tables live on the meals Neon DB via migration `011_restock_tracker.sql`. See the Restock Tracker section below.

On Vercel set `SUPER_ADMIN_USERS`, `APP_USERS`, `TOOLS_SESSION_SECRET`, and `MEALS_DATABASE_URL`. After deploy, run `npm run migrate:meals` if meals/watching/house-projects/restock migrations are not applied yet.

## Rollback

1. Revert or undeploy the branch on Vercel.
2. Standalone `mealplanner` and `shootemup` apps/databases remain untouched.
3. CRM data is unaffected (separate database).

## Restock Tracker

Private tool at `/tools/restock-tracker`. It does **not** scrape behind CAPTCHAs. Empty or blocked retailer responses are never shown as “sold out.”

### Tracked products

| Retailer | ID | URL |
|---|---|---|
| GameStop | `451607` | [product page](https://www.gamestop.com/consoles-hardware/nintendo-switch-2/products/nintendo-switch-2-the-legend-of-zelda-40th-anniversary-edition/451607.html) |
| Best Buy | SKU `13234053` (page `J7GSL57HTY`) | [product page](https://www.bestbuy.com/product/switch-2-the-legend-of-zelda-40th-anniversary-edition/J7GSL57HTY) |

### Environment

| Variable | Required | Purpose |
|---|---|---|
| `CRON_SECRET` | Production | Vercel sends `Authorization: Bearer <CRON_SECRET>` to `/api/cron/restock-tracker`. The route fails closed if this is missing or shorter than 16 characters. |
| `RESEND_API_KEY` | For email | Same Resend key the rest of the app uses. |
| `RESTOCK_FROM_EMAIL` or `CONTACT_FROM_EMAIL` | For email | Verified sender. |
| `RESTOCK_ALERT_EMAILS` | Optional | Default recipients (comma-separated). Also editable in the dashboard. If empty, the UI shows **Notifications not configured**. |
| `BESTBUY_API_KEY` | Optional | Documented Best Buy API fallback if headed Chrome is unavailable. Not used for the 5-minute page refresh. |
| `RESTOCK_DISABLE_BROWSER` | Optional | Set to `1` to skip headed Chrome. |
| `RESTOCK_BROWSER_EXECUTABLE` | Optional | Local Chrome path. |
| `RESTOCK_CHROME_PORT` | Optional | CDP port for the dedicated headed Chrome (default `9333`). |

### Database

```bash
npm run migrate:meals
```

Applies `db/meals/migrations/011_restock_tracker.sql` (settings, products, checks, store state, stock events, alert queue) on the meals Neon database. The script skips already-applied files.

### Vercel

1. Merge keeps the existing `0 14 * * *` recurring-invoice cron and adds `*/5 * * * *` → `/api/cron/restock-tracker`.
2. Set `CRON_SECRET`, `MEALS_DATABASE_URL`, Resend vars, and (recommended) `BESTBUY_API_KEY` on the project.
3. Deploy, then run `npm run migrate:meals` against production meals Neon.
4. Open `/tools/restock-tracker`, set ZIP/radius/emails, click **Check now**.
5. Confirm a scheduled run in Vercel → Crons / function logs before treating monitoring as live. Super admin can send a test email from the dashboard.

### How checks work

- **GameStop:** Load the public product page in headed Chrome, then read `Stores-FindStores` from that session. Cloudflare 403s curl, headless Chrome, and Vercel.
- **Best Buy:** Load the public product page in the same headed Chrome and parse the fulfillment GraphQL request the page fires itself (`buttonState` + nearby pickup stores). Headless/datacenter sessions never finish `page.goto`.

Both run on this Mac via `npm run restock:check` (or `npm run restock:install-agent` every 5 minutes) and write to the meals Neon database the dashboard reads.

Alerts fire on the first confirmed availability and on unavailable→available. Failed checks never reset last-known state. Failed emails stay `pending` and retry with backoff; successful sends are never repeated.

## Limitations

- Watching stream overrides are weekly night/time per service (not per-episode absolute drop timestamps).
- House Projects v1 has no photos/receipts, due dates, or notifications; assignees are line-item only.
- Login rate limiting is in-memory per server instance.
- Arcade device-name score claims are unchanged; tools login gates access to the game, not gamertag ownership.
- Meal photo uploads remain disabled until storage is chosen (same as Meal Planner).
- Restock Tracker stays unverified until a headed Chrome check from this Mac has succeeded (`npm run restock:check`). Datacenter/headless browsers cannot load these storefronts.
