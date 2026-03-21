
# Compose Update: TCP Wait for Postgres

This compose replaces `pg_isready` with a portable Node TCP probe so the app
waits for `db:5432` using only Node (no extra packages). Use this if your `web`
image is `node:20-slim` and does not have `pg_isready` available.

## How to use
1. Replace your stack's `docker-compose.yml` with this file.
2. Recreate/Deploy the stack in Portainer.
3. In web logs, you should see:
   - "Waiting for Postgres on db:5432..."
   - "DB is reachable. Proceeding..."
   - `npm install` → `prisma migrate deploy` → `next build` → `npm start`
