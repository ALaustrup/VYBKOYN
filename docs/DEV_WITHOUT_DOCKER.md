# Develop without Docker Desktop

VYBKOY runs as **Node.js + PostgreSQL**. Skip Docker entirely if you prefer.

## Option A — Cloud Postgres (zero local DB install)

Best if you do not want PostgreSQL installed on Windows.

1. Create a free database at [Neon](https://neon.tech) or [Supabase](https://supabase.com) (PostgreSQL).  
   *(This repo may already have a Neon project **VYBKOYN** — connection string lives in `server/.env`, not in git.)*
2. Copy the connection string (must start with `postgresql://`).
3. `server/.env`:

   ```env
   DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"
   JWT_SECRET="your-long-random-secret"
   CHAIN_ID=8453
   CORS_ORIGINS="http://localhost:3000"
   REQUIRED_CLIENT_BUILD=1
   ```

4. Apply schema:

   ```powershell
   cd server
   npx prisma db push
   ```

5. Start app (from repo root):

   ```powershell
   .\scripts\start-dev.ps1
   ```

   Or two terminals: `cd server && npm run dev` and `cd web && npm run dev`.

6. Open **http://localhost:3000** (ensure `web/.env.local` has `NEXT_PUBLIC_API_URL=http://localhost:4000`).

## Option B — PostgreSQL on Windows

1. Install [PostgreSQL for Windows](https://www.postgresql.org/download/windows/) (include pgAdmin optional).
2. Create database `koyn` and user, or use default `postgres` user.
3. Set `DATABASE_URL` in `server/.env`, e.g.:

   ```env
   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/koyn?schema=public"
   ```

4. `cd server && npx prisma db push`
5. `.\scripts\start-dev.ps1` or manual `npm run dev` in `server` + `web`.

## Option C — Keep using Docker (optional)

Only if you install Docker Desktop or another engine (Podman, Rancher Desktop, WSL2 `docker-ce`). Not required for development.

## What you lose without Docker

- One-command `npm run docker:up` for all three services.
- Identical container images to production.

What you **keep**: full game, auth, shop, leaderboard, and claim API — same codebase.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Auth / tap 500 errors | Run `npx prisma db push` in `server/`; check `DATABASE_URL` |
| CORS errors | `CORS_ORIGINS` must include `http://localhost:3000` |
| Stuck on “Checking for mandatory updates” | `web/.env.local` needs `NEXT_PUBLIC_CLIENT_BUILD` ≥ server `REQUIRED_CLIENT_BUILD` |
| Wallet wrong chain | Use Base (`8453`) or match `CHAIN_ID` / `NEXT_PUBLIC_CHAIN_ID` |
