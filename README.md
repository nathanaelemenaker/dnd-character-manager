
# D&D 5e Character Manager (Next.js)

A self-hosted, mobile-friendly character manager for D&D 5e that supports both SRD 5.1 (2014) and SRD 5.2.1 (2024) rules per character. Email/password auth, homebrew support, and SRD sync from public APIs.

## Quick start (Portainer, no Git)

1. Copy this folder to your Docker host: `/opt/dnd-sheet`.
2. In Portainer → **Stacks → Add stack → Web editor**: paste `docker-compose.yml` from this folder and **Deploy**.
3. Wait for containers to start. The app serves on port **3000**. Point your reverse proxy `emenaker.org` → `http://<host>:3000`.
4. Open `https://emenaker.org`, register an account, create a character, and select **2014** or **2024** rules.

### First SRD sync (2014)
From Portainer → Containers → `web` → Console → `/bin/sh`:
```bash
npm run sync:open5e
npm run sync:dnd5e
```

## Attribution
- SRD 5.1 and SRD 5.2.1 are released under **CC BY 4.0**; include attribution in the footer/About page.
- Data sources: Open5e API and the community D&D 5e SRD API.

## Scripts
- `npm run sync:open5e` – import spells from Open5e (2014 SRD)
- `npm run sync:dnd5e` – import spells from D&D 5e SRD API (2014 SRD)

## Environment
- `APP_SECRET` – required. Long random string used to sign session cookies.
- `APP_BASE_URL` – set to your public URL (e.g., `https://emenaker.org`).

## Notes
- This starter mounts the source at runtime and builds inside the container for simplicity. For production efficiency, consider building an image via the provided `Dockerfile` and using it in compose.
