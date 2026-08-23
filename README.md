# King Street Sites

Public-facing agency website for King Street Sites. This project is a marketing-first Next.js app focused on clarity, trust, and contact conversion for local business clients.

## What this site includes
- Home, Portfolio, Services, About, Contact pages
- Conversion-focused copy and repeated CTA strategy
- Resend-ready contact and free site audit workflow
- Lightweight admin login and internal CRM dashboard shell

## Demo prompt files
Prompt build briefs for demo client sites live in `prompts/`:
- `prompts/restaurant-outrun-burger.md`
- `prompts/law-mile-high-injury.md`
- `prompts/law-denver-family-estate.md`
- `prompts/home-summit-air-denver.md`
- `prompts/home-elevate-remodeling.md`

Monaghan's is included in the portfolio as an existing reference project but does not have a prompt file.

## Run the project
1. Install dependencies:
   - `npm install`
2. Start local development:
   - `npm run dev`
3. Open `http://localhost:3000`

## Portfolio businesses included
- Monaghan's (existing reference)
- Outrun Burger (restaurant demo)
- Mile High Injury Law (law firm demo)
- Denver Family & Estate Law (law firm demo)
- Summit Air Denver (home service demo)
- Elevate Remodeling (home service demo)

## Environment variables
Create a `.env.local` file with:

```bash
AUTH_SECRET=generate-a-long-random-string
AUTH_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=choose-a-strong-password
DATABASE_URL=postgresql://...
RESEND_API_KEY=your_resend_api_key
CONTACT_TO_EMAIL=owner@yourdomain.com
CONTACT_FROM_EMAIL=notifications@yourdomain.com
AUTO_REPLY_FROM_EMAIL=hello@yourdomain.com
```

- `AUTH_SECRET` required for session signing (e.g. `openssl rand -base64 32`).
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` required for admin dashboard login.
- `RESEND_API_KEY` required for outbound email.
- `CONTACT_TO_EMAIL` required recipient for inbound lead notifications.
- `CONTACT_FROM_EMAIL` required sender address for notifications.
- `AUTO_REPLY_FROM_EMAIL` optional sender for prospect auto-replies.
- `NEXT_PUBLIC_SITE_URL` used for admin logout redirect handling.
- `DATABASE_URL` — Neon pooled connection string (use `-pooler` host).
- `DATABASE_URL_UNPOOLED` — direct Neon URL for `npm run db:schema` and migrations.

## Neon usage
Neon is supported with a minimal schema for CRM lead persistence.

If `DATABASE_URL` is set:
- Contact and audit submissions are inserted into the `leads` table.
- Admin dashboard reads the latest leads from Neon.

If `DATABASE_URL` is not set:
- The dashboard falls back to mock records so the admin shell still renders.

Initialize Neon by running the SQL in `lib/db-schema.sql` against your Neon database.
