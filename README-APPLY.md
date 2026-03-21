
# Corrected Files Package

This ZIP contains fixes to resolve the Prisma schema validation errors and the OpenSSL warning you saw in logs.

## What changed

1. **`prisma/schema.prisma`**
   - Removed semicolons in the datasource block (Prisma expects one setting per line).
   - Ensured one field per line (e.g., ability scores), and validated all models/enums.

2. **`docker-compose.yml`** (runtime install pattern)
   - Adds a **Node TCP wait** for Postgres (no `pg_isready` dependency).
   - Installs **OpenSSL** before `npm install` so Prisma can detect libssl.
   - Runs `npm install` → `prisma generate` → `prisma migrate deploy` → `next build` → `npm start`.

3. **Prebuilt image option** (faster restarts)
   - **`Dockerfile`** with OpenSSL baked in and build steps.
   - **`docker-compose.prebuilt.yml`** that builds an image and starts instantly with `prisma migrate deploy` + `npm start`.

## How to apply

### Option A — Keep your current mount-and-install workflow
1. Copy **`prisma/schema.prisma`** from this ZIP over your existing file at `/opt/dnd-sheet/prisma/schema.prisma`.
2. Replace your stack's compose with the provided **`docker-compose.yml`**.
3. In Portainer: **Recreate/Deploy** the stack and watch logs.

### Option B — Prebuilt image (recommended for stability)
1. Copy **`Dockerfile`** from this ZIP into `/opt/dnd-sheet/`.
2. Copy **`prisma/schema.prisma`** as above.
3. Use **`docker-compose.prebuilt.yml`** contents for your stack (or rename to `docker-compose.yml`).
4. From the host in `/opt/dnd-sheet`, build the image:
   ```bash
   docker build -t dnd-sheet:latest .
   ```
5. In Portainer: **Recreate/Deploy** the stack. Restarts will now be much faster and won’t run `npm install`/`next build` every time.

## After deploy
- Visit your app, register, and create a character.
- (Optional) Run SRD 2014 syncs from the web console:
  ```bash
  npm run sync:open5e  # Open5e SRD sync
  npm run sync:dnd5e   # D&D 5e SRD API sync
  ```

If any error remains, share the last ~40 lines of `web` logs and I’ll patch immediately.
