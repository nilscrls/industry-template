# Deployment & operations

## Compose profiles and overlays

| Command | Profile | Overlay | What runs |
|---|---|---|---|
| `pnpm compose:dev` | `dev` | `docker-compose.dev.yml` | postgres, redis, minio, maildev — ports exposed to the host; apps run via `pnpm dev` |
| `pnpm compose:all` | `all` | `docker-compose.dev.yml` | infra + built api/web images, ports exposed — full-stack rehearsal on one machine |
| `pnpm compose:prod` | `all` | `docker-compose.prod.yml` | infra + apps, **no host ports**; web/api join the external `proxy` network |

The base `docker-compose.yml` defines services only. Overlays add ports (dev)
or the reverse-proxy network (prod). Startup ordering is enforced with
healthchecks: postgres/redis/minio healthy → `migrate` (one-shot, applies
drizzle migrations) completes → api healthy (`/health/live`) → web.

## Images

Both Dockerfiles are multi-stage: `turbo prune <app> --docker` → install
pruned lockfile → `turbo build` → slim runtime as the `node` user.

- **api**: `pnpm deploy` produces a self-contained bundle; entry
  `node dist/main.js`; the same image runs migrations
  (`node node_modules/@repo/db/dist/migrate.js`).
- **web**: Next standalone output; entry `node apps/web/server.js`.
  `NEXT_PUBLIC_API_URL` is a **build arg** (baked into the client bundle).

## Reverse proxy

Create the shared network once: `docker network create proxy`. Route
path-based on one hostname (keeps everything same-origin):

- `app.example.com/*` → `web:3000`
- `app.example.com/api/*` → `api:3001`, **stripping the `/api` prefix**

Traefik labels for exactly this are commented in `docker-compose.prod.yml`.
nginx equivalent: `location /api/ { proxy_pass http://api:3001/; }` (note
both trailing slashes — that's what strips the prefix). The api re-adds
`/api` internally for the Better-Auth router; nothing else cares.

## Environment matrix

`.env` (one file at the repo root, consumed by compose and `dotenv-cli`) —
generated from `.env.example` at scaffold time with a random
`BETTER_AUTH_SECRET`.

| Variable | Local dev | Prod (compose overrides in-network values) |
|---|---|---|
| `WEB_URL` | `http://localhost:3000` | `https://app.example.com` |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3000/api` | `https://app.example.com/api` (build arg) |
| `API_URL` | `http://localhost:3001` | `http://api:3001` (set by compose) |
| `DATABASE_URL` / `REDIS_URL` | localhost | service hostnames (set by compose) |
| `S3_ENDPOINT` | `http://localhost:9000` | `http://minio:9000` (set by compose) |
| `S3_PUBLIC_ENDPOINT` | `http://localhost:9000` | a browser-reachable URL — expose Minio through the proxy or use a real S3 |
| `SMTP_*` / `MAIL_FROM` | maildev | your provider's credentials |
| `BETTER_AUTH_SECRET` | generated | **rotate per environment**, ≥ 32 chars |
| `LOG_LEVEL` / `LOG_FILE_ENABLED` / `LOG_DIR` | `debug` / `false` | `info` / enable file rotation only on VMs without a log collector |

Checklist for a new environment: secret rotated, real SMTP, real
`S3_PUBLIC_ENDPOINT`, `WEB_URL`/`NEXT_PUBLIC_API_URL` on the public domain,
`NODE_ENV=production` (compose sets it — it enables required email
verification).

## Scaling notes

The api is stateless by construction — sessions, rate-limit counters,
queues and caches all live in Redis/Postgres — so `api` can scale
horizontally behind the proxy. BullMQ workers currently run inside the api
process; to isolate mail/jobs load, move the processors into a second
deployment of the same image with a worker-only entrypoint. Postgres and
Redis are single nodes here: bring managed equivalents for anything beyond
one host, and point `DATABASE_URL`/`REDIS_URL` at them — nothing else
changes.

## Day-2 operations

- **Migrations** ship with the image and run as the `migrate` one-shot
  before the api starts; rollbacks are forward-fixes (generate a new
  migration) — drizzle SQL migrations are append-only.
- **Seeding in prod**: only the baseline
  (`pnpm --filter @repo/db seed` resets role permissions to the contract
  defaults). The dev-fixture seeder refuses `NODE_ENV=production`.
- **Observability**: JSON logs on stdout with `traceId`; ship them with your
  platform's collector. `x-request-id` is honored inbound, so proxy-assigned
  ids flow through logs and error payloads.
- **Backups**: `postgres-data` and `minio-data` volumes are the state;
  `pg_dump` on a schedule + object-storage replication is the minimum.
- **Health**: point uptime checks at `/api/health/ready` (through the proxy)
  — it verifies db and redis, not just the process.
