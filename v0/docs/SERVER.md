# Atlas — OCI Production Server

## Access

```bash
ssh -i ~/.ssh/oracle_key ubuntu@40.233.99.118
```

Port 3001 is firewalled externally. Use SSH tunnel for local dev:

```bash
npm run tunnel   # ssh -L 3001:localhost:3001 -N ubuntu@40.233.99.118
```

Vite proxy points to `localhost:3001` — tunnel must be running. Vite may land on `5174` if `5173` is already in use.

## Databases (OCI only — local Postgres is decommissioned)

| DB | Connection |
|---|---|
| Realtime | `postgresql://ubuntu:ouija@localhost:5432/realtime` |
| Static | `postgresql://ubuntu:ouija@localhost:5432/static` |

## Deploy Workflow

TypeScript is not installed on OCI — always compile locally first.

```bash
# 1. Compile server (required for any server/src/ changes)
cd server && npm run build && cd ..

# 2. Rsync to OCI
rsync -av -e "ssh -i ~/.ssh/oracle_key" server/dist/ ubuntu@40.233.99.118:/home/ubuntu/atlas-server/dist/

# 3. Restart
ssh -i ~/.ssh/oracle_key ubuntu@40.233.99.118 "pm2 restart atlas-server"
```

**IMPORTANT**: `npm run build` at the repo root only builds the Vite frontend. Server changes require the separate `cd server && npm run build` step above.

## PM2 Command (full, for fresh start)

```bash
pm2 delete atlas-server 2>/dev/null
pm2 start /home/ubuntu/atlas-server/dist/server.js \
  --name atlas-server \
  --cwd /home/ubuntu/atlas-server \
  --node-args='--max-old-space-size=700' \
  --max-memory-restart 500M \
  --cron-restart='0 4 * * *'
pm2 save
```

`--cwd` is critical — without it dotenv loads from the wrong directory and all API keys are undefined.

## Scripts (import-gtfs, backfill, etc.)

```bash
npx tsc -p server/tsconfig.scripts.json
rsync -av -e "ssh -i ~/.ssh/oracle_key" server/dist-scripts/ ubuntu@40.233.99.118:/home/ubuntu/atlas-server/dist-scripts/
```

## Zombie Query Check

If `pm2 restart` happens before queries finish, connections stay alive indefinitely. Kill them:

```sql
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
WHERE state = 'active' AND query_start < NOW() - INTERVAL '30 seconds' AND pid != pg_backend_pid();
```

Run on the `static` DB via SSH.
