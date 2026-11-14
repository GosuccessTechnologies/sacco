# Divine Sacco Management System (DSMS)

Full-stack SACCO management system + public website. The complete technical reference is
[`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md) (single source of truth — 2,033 lines).

## Stack
Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind CSS 4 + shadcn/ui ·
Prisma 6 (SQLite dev / PostgreSQL / MySQL 8 prod) · NextAuth v5 (HTTPOnly JWT) ·
Zustand + TanStack Query v5 · Recharts · jsPDF · Nodemailer.

## Quick start (development)
```bash
bun install                # or npm install
cp .env.example .env       # then edit secrets
bun run db:push            # create SQLite schema
bun run db:seed            # themes, letterheads, COA, products, users, demo data
bun run dev                # http://localhost:3000
```

### Demo logins (seed)
| Role | Email | Password |
|---|---|---|
| Super admin | admin@divinesacco.co.ke | Divine@2026 |
| Manager / Teller / Loans / Accounts / Compliance / Reception | {role}@divinesacco.co.ke | Divine@2026 |
| Members | member1..3@divinesacco.co.ke | Divine@2026 |

## Production (Vercel or self-host)
1. `DATABASE_PROVIDER=postgresql` (or `mysql`) + `DATABASE_URL=postgres://…` — the provider
   script rewrites `prisma/schema.prisma` automatically (guide §4.1).
2. Set env: `SESSION_SECRET`, `APP_ENCRYPTION_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`.
3. `bun run db:push` (or `prisma migrate deploy`), then `SEED_DEMO=false bun run db:seed`.
4. Enter integration credentials in **Administration → Settings → Integrations**
   (M-Pesa Daraja, PesaPal, SMTP, SMS gateway, social links) — they auto-test on save.
   Demo mode simulates provider responses for training.
5. Deploy to Vercel (`vercel deploy`) — `vercel.json` ships the cron schedule; replace
   `REPLACE_WITH_CRON_SECRET` with your `CRON_SECRET`.

## Maps
- Public site: `/` · `/apply` · `/login`
- Member PWA: `/dashboard` (installable — manifest + service worker)
- Back-office: `/admin/*` (12 module groups per the guide)
- API: `/api/*` + webhooks `/api/webhooks/{mpesa,pesapal}` + cron `/api/cron/[job]`

## Tests
```bash
bash scripts/smoke-test.sh   # auth + pages + all APIs
bash scripts/e2e-test.sh     # full lifecycle through the real engines (GL must balance)
bun run lint
```
