# D&D 5e Character Manager

A self-hosted, mobile-friendly D&D 5e character sheet manager. Supports both SRD 5.1 (2014) and SRD 5.2.1 (2024) rules per character. Built with Next.js 14, PostgreSQL, and Prisma.

---

## Features

- **Full character sheet** — Overview, Abilities, Combat, Skills, Spells, Inventory, Notes, Features, Class Guide, Bio tabs
- **Dual ruleset support** — toggle between SRD 2014 and SRD 2024 per character
- **SRD item & spell search** — powered by dnd5eapi.co and Open5e
- **Inventory system** — attunement tracking, equipped items, item notes, key ability parsing
- **Spell slot tracking** — validator warns when slots don't match SRD for class/level
- **Level Up modal** — HP rolling, ASI selection, subclass picker, auto-add class features
- **Notes tab** — named notebook pages with Markdown support and auto-save
- **Portrait images** — persistent character portraits, resized and stored on the host
- **User & role management** — USER / ADMIN / SUPER_ADMIN roles, admin panel, impersonation
- **Mobile-friendly** — responsive layout, scrollable tab bar
- **PDF export** — print any character sheet to PDF via browser

---

## Quick Start (Docker Compose)

### 1. Clone the repo

```bash
git clone https://github.com/nathanaelemenaker/dnd-character-manager.git
cd dnd-character-manager
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```env
DATABASE_URL="postgresql://app:app@db:5432/app?schema=public"
APP_BASE_URL="https://yourdomain.com"
APP_SECRET="your-random-64-char-secret"
ADMIN_USER_IDS="your-cuid-after-first-login"
ADMIN_EMAIL_DOMAIN=""
```

Generate a secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Start the stack

```bash
docker compose up -d
```

The app builds automatically on first start (takes 2–3 minutes). Once ready it serves on port **3000**.

### 4. Register your account

Visit `http://localhost:3000`, register, then set yourself as SUPER_ADMIN by adding your user ID to `ADMIN_USER_IDS` in `.env` and restarting.

Find your user ID after registering:
```bash
docker exec <container> node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.findMany({ select: { id: true, email: true } }).then(r => { console.log(r); process.exit(0); });
"
```

### 5. Sync the SRD item catalog (optional but recommended)

From the app, log in as an admin and visit `/admin/items` to use the sync buttons, or run from the container:

```bash
docker exec <container> sh -c "cd /app && npm run sync:open5e && npm run sync:dnd5e"
```

---

## Deployment Options

### Option A — Mount source (default, easier updates)

Uses `docker-compose.yml`. The source is bind-mounted and the app builds inside the container on every start. Slower to restart (~2–3 min) but changes are picked up by restarting the container.

```bash
docker compose up -d
```

### Option B — Prebuilt image (faster restarts)

Uses `docker-compose.prebuilt.yml`. Build a local image first, then start. Restarts are fast (~5 sec) since the build is baked in.

```bash
docker build -t dnd-sheet:latest .
docker compose -f docker-compose.prebuilt.yml up -d
```

Note: after any code change you must rebuild the image and recreate the container.

---

## Portainer / Synology NAS

1. Copy the project to your Docker host (e.g., `/opt/dnd-sheet/`)
2. Create `.env` from `.env.example`
3. In Portainer → Stacks → Add stack → Repository or Web editor
4. Point your reverse proxy to `http://<host>:3000`

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `APP_SECRET` | ✅ | Random secret for session cookies (min 32 chars) |
| `APP_BASE_URL` | ✅ | Public URL of the app (no trailing slash) |
| `ADMIN_USER_IDS` | ⚠️ | Comma-separated user IDs that get SUPER_ADMIN role |
| `ADMIN_EMAIL_DOMAIN` | ❌ | Email domain that gets ADMIN role (e.g., `example.com`) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Database | PostgreSQL 16 |
| ORM | Prisma 5 |
| Auth | Cookie-based sessions (argon2 password hashing) |
| Image processing | sharp (portrait resizing) |
| Markdown | marked |
| Deployment | Docker Compose |

---

## Data Sources

- [D&D 5e SRD API](https://www.dnd5eapi.co) — SRD 2014 spells and equipment
- [Open5e API](https://open5e.com) — SRD 2014 and 2024 magic items and spells
- SRD 5.1 and SRD 5.2.1 content is released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

---

## User Roles

| Role | Assigned by | Capabilities |
|---|---|---|
| `USER` | Default on registration | Own characters only |
| `ADMIN` | SUPER_ADMIN via admin panel | View/edit all characters, create users, reset passwords, impersonate USERs |
| `SUPER_ADMIN` | `ADMIN_USER_IDS` env var | All ADMIN capabilities + promote/demote ADMINs |

---

## Portrait Storage

Portrait images are stored on the host filesystem at `public/uploads/portraits/` and served via `/api/portraits/[filename]`. This directory is gitignored — make sure it persists across deployments (it will if you use a bind mount as in the default compose).

---

## License

MIT
