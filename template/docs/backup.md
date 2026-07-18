# Backup & restore

Database dumps and an object-storage mirror, run as one-shot containers under
the compose `backup` profile. No local `pg_dump` or `mc` install is needed —
the jobs run in `postgres:17-alpine` (client matches the server major) and
`minio/mc`, join the stack's network, and write to `BACKUP_DIR` on the host.
The wrappers are plain Node, so every command below works on Linux, macOS and
Windows. The stack must be running (`pnpm compose:dev` or the prod overlay).

| Command | What it does |
|---|---|
| `pnpm backup:db` | `pg_dump --format=custom` → `BACKUP_DIR/db/<utc-timestamp>.dump`, then deletes dumps older than `BACKUP_RETENTION_DAYS` |
| `pnpm backup:files` | `mc mirror --overwrite --remove` of the `S3_BUCKET` bucket → `BACKUP_DIR/files/<bucket>` |
| `pnpm restore:db <file> [--yes]` | `pg_restore --clean --if-exists --no-owner` of a dump from `BACKUP_DIR/db` — asks you to retype the database name |
| `pnpm restore:files [--yes]` | mirrors `BACKUP_DIR/files/<bucket>` back into the bucket — asks you to retype the bucket name |

Configuration lives in `.env` (`BACKUP_DIR`, `BACKUP_RETENTION_DAYS` — see
`.env.example`). `BACKUP_DIR` is git-ignored.

## What is (and isn't) covered

- **Postgres**: the `app` database — schema, data, and RLS policies (they are
  table DDL). The `openfga` database holds the authorization tuples; after a
  db-only restore, run `pnpm fga:sync` to rebuild derived tuples from Postgres
  (grant tuples that live only in FGA are lost — see `docs/authorization.md`).
- **Files**: the uploads bucket, as an incremental mirror. Retention applies
  to **db dumps only**; for point-in-time file recovery, snapshot `BACKUP_DIR`
  with your backup tool (restic/borg/ZFS/whatever you already run).
- **Not covered**: Redis (cache/queues/sessions — all rebuildable), the
  `openfga` database (rebuilt by `pnpm fga:sync` except FGA-only grants).

## Restore runbook

1. `docker compose stop api web` — no writers during restore.
2. `pnpm restore:db 2026-07-18T02-00-00Z.dump`
3. `pnpm restore:files`
4. `pnpm db:migrate` — no-op unless the dump predates newer migrations.
5. `pnpm fga:sync` — reconcile authorization tuples with the restored rows.
6. `docker compose start api web`

## Scheduling

Backups are on-demand by design — wire the two commands into whatever runs
your host. The jobs are `restart: "no"` one-shots, safe to run from cron.

cron (Linux, as the user that owns the checkout):

```cron
# nightly db dump at 03:00 UTC, files mirror at 03:15
0 3 * * *  cd /srv/my-app && /usr/bin/env pnpm backup:db >> /var/log/my-app-backup.log 2>&1
15 3 * * * cd /srv/my-app && /usr/bin/env pnpm backup:files >> /var/log/my-app-backup.log 2>&1
```

systemd timer (drop-in alternative to cron):

```ini
# /etc/systemd/system/my-app-backup.service
[Unit]
Description=my-app db + files backup
[Service]
Type=oneshot
WorkingDirectory=/srv/my-app
ExecStart=/usr/bin/env pnpm backup:db
ExecStart=/usr/bin/env pnpm backup:files

# /etc/systemd/system/my-app-backup.timer
[Unit]
Description=nightly my-app backup
[Timer]
OnCalendar=*-*-* 03:00:00 UTC
Persistent=true
[Install]
WantedBy=timers.target
```

Windows: Task Scheduler → "Start a program" → `pnpm` with arguments
`backup:db`, "Start in" = the repo root (repeat for `backup:files`).

Ship the dumps off-host: `BACKUP_DIR` on a mounted backup volume, or a second
`mc mirror` from `BACKUP_DIR` to a remote bucket. A backup that lives only on
the database host is a copy, not a backup.

## Restoring into a brand-new environment

First boot creates the cluster-level roles (`app_user`/`app_auth`) and the
`openfga` database via `packages/db/sql/init-roles.sh` — bring the stack up
once normally, then follow the runbook above. Dumps do not contain roles.
