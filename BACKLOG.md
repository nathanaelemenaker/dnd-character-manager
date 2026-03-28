# D&D 5e Character Manager — Feature Backlog

Last updated: 2026-03-28

---

## 📋 Pending Features

### 1. ⚔️ Campaign System

**Problem**
Characters exist in isolation — no way to group them into a campaign or share between users.

**Campaign Model**
- `Campaign` — id, name, description, createdAt, dmUserId
- `CampaignMember` — campaignId, characterId, userId, joinedAt

**DM capabilities**
- Create campaign, invite players by username or join code
- View all member characters (read-only overview)
- Give items to characters, manage HP, add shared campaign notes

**Player capabilities**
- Join a campaign with one or more characters
- See other players' basic stats (DM-configurable)
- Receive items from the DM

**Schema changes**
- New `Campaign`, `CampaignMember`, `CampaignNote` models
- `Character` gets optional `campaignId` references

---

### 2. 📱 PWA & Native App (Future)

**Phase 2 — Progressive Web App (PWA)**
- Add `manifest.json` and service worker for "Add to Home Screen"
- Offline caching for character sheet (read-only when offline)

**Phase 3 — Native Mobile App**
- React Native app using the same API backend
- Shared authentication with the web app

---

### 3. 🧹 Full Repository Audit & Cleanup

**Problem**
The codebase has accumulated dead code, misplaced files, and stale imports from multiple rounds of refactoring.

**Scope**
- Dead files to remove:
  - `app/components/Navbar.tsx` — replaced by `TopNav.tsx`
  - `app/components/NavbarServer.tsx` — replaced by `TopNav.tsx`
  - `app/lib/auth/session.ts` — replaced by `app/lib/auth.ts`
  - `app/api/dev/*` routes — development-only, should not exist in production
  - `app/api/characters/CharactersClient.tsx` — client component misplaced inside `api/` directory
  - Redis service in `docker-compose.yml` — confirmed unused, now removed
- Stale imports to fix:
  - Anything referencing `@/lib/auth/session`, `@/lib/db`, `@/lib/auth/roles`, or old `Navbar` components
- Legacy workarounds to remove:
  - `ensureUserExists()` in `app/api/characters/route.ts` — can create ghost users with placeholder `!` passwords
- General pass:
  - Remove all TODO/FIXME comments that have been resolved
  - Confirm `@eaDir` Synology metadata files are gitignored
  - Confirm `public/uploads/` is gitignored

---

## 🐛 Known Issues

- Non-fatal render warning: `Cannot read properties of undefined (reading '0')` in `CharacterSheetClient.tsx` — pre-existing, not user-facing

---

## 📦 Dependencies Added (ensure committed to git)

| Package | Version | Purpose |
|---|---|---|
| `sharp` | ^0.34.5 | Portrait image resizing |
| `marked` | latest | Markdown rendering in Notes tab |

---

## ✅ Completed Features

### 📓 Notes Tab (2026-03-28)
- New Notes tab between Features and Class Guide
- Sidebar list of named notes — click to open, + to create new
- Markdown editor with live preview toggle (Edit / Preview)
- Auto-save with 1 second debounce — shows "Saving…" / "✓ Saved" status
- Delete note with confirmation
- Persisted in new `CharacterNote` table in the database
- Uses `marked` library for markdown rendering

### 🖼️ Persistent Profile Pictures (2026-03-28)
- Portrait images now persist across refreshes
- Upload resizes to max 400px (longest side), converts to WebP via `sharp`
- Stored at `/opt/dnd-sheet/public/uploads/portraits/[characterId].webp`
- Served via `/api/portraits/[filename]` route (dynamic, not static — works in production)
- URL stored in `Character.portrait` DB field
- Remove button deletes file from disk and clears DB field
- `public/uploads/` added to `.gitignore`

### 📱 Mobile Responsiveness — Phase 1 (2026-03-27)
- TopNav collapses gracefully on mobile (≤600px): email and "Admin Panel" button hidden
- Role badge remains visible and tappable to open admin panel on mobile
- Character sheet tab bar already horizontally scrollable
- Character roster and sheet panels render well at mobile widths

### 🎯 Overview Tab Interactive Controls (2026-03-27)
- Spell slot pips are now clickable — use/recover slots directly from Overview
- 🌙 Long Rest button in Quick Actions panel at bottom of Overview
- ⬆ Level Up button in Quick Actions panel opens Level Up modal directly

### 📝 Item Notes (2026-03-27)
- Notes textarea added to expanded inventory item view (click item name to expand)
- Saves to API on blur via existing `PATCH /api/characters/[id]/inventory/[invId]`
- 📝 indicator icon shown next to item name when notes exist, with tooltip preview

### 🔐 User & Role Management (2026-03-27)
- Added `role` (USER / ADMIN / SUPER_ADMIN) and `deletedAt` to User schema
- SUPER_ADMIN driven by `ADMIN_USER_IDS` env var, never the DB column
- ADMIN role stored in DB, promotable by SUPER_ADMIN only
- Login now actually verifies passwords via argon2 (was previously wide open)
- Register route fixed — was using wrong imports and skipping password hashing
- Logout works and correctly clears all auth + impersonation cookies
- Auth consolidated into a single cookie-based system (`dnd_user_id` + `session_email`)
- Admin panel modal (accessible from nav for ADMIN+):
  - Users tab: list all users with role badges, create user, reset password, promote/demote (SUPER_ADMIN only), soft delete
  - Characters tab: view all characters across all users, click to open any sheet
- Impersonation: ADMIN can view as any USER; SUPER_ADMIN can view as anyone
- Persistent red banner shown while impersonating with one-click exit
- Character roster correctly scoped to current user (or impersonated user)
- All character API routes updated to use async `getSession()`

### Core Character Sheet
- Full D&D 5e character sheet — Overview, Abilities, Combat, Skills, Spells, Inventory, Features, Notes, Class Guide, Bio tabs
- SRD spell and item search — SRD 2014 (dnd5eapi.co) + SRD 2024 (open5e.com), merged and deduplicated
- Custom spell entry with paste-from-wikidot parser
- Custom item entry with paste-from-wikidot parser
- Spell slot validator — warns when slots don't match SRD for class/level
- Attunement system — 3-item limit enforced with tracker and warnings
- Active Stat Bonuses — Combat tab shows all bonuses from equipped items
- Item Abilities — auto-parses descriptions; editable Key Abilities field per item
- Level Up modal — HP rolling, ASI selection, subclass picker, auto-add class features
- Class Guide tab — full progression table with subclass notes
- Character roster page with HP bars, AC, class colors, last-played time
- Roster button and PDF export button in character sheet header
- Print styles for PDF export
- Multi-user support with cookie-based auth
