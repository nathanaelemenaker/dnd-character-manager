# D&D 5e Character Manager — Feature Backlog

Last updated: 2026-07-10

---

## 📋 Pending Features

### Priority 1 — High Value, Build Next

---

#### P1-1. 🩸 DM Can Push HP / Conditions to Player Sheets
**Why:** Single biggest differentiator over D&D Beyond — they literally cannot do this because players own their own sheets. You control both ends.

**Scope:**
- DM combat panel in campaign view: select one or more PC targets, deal damage or heal, apply/remove conditions
- Changes reflect immediately on the target player's sheet (poll or SSE)
- Automatic concentration check prompt when a concentrating character takes damage (DM sees alert, can auto-fail or roll)
- Spell duration / effect tracking with round countdown and auto-expiry

**Recommendation:** Build this before anything else. It's the feature that makes this app irreplaceable for Sam mid-combat.

---

#### P1-2. ✨ Spell Tab UX Overhaul
**Why:** High daily friction for all spellcasters. Data model already supports every filter — this is pure UI work.

**Scope:**
- Filter by current castable slot level (hide spells requiring higher slots)
- Group or badge by: ritual, concentration, prepared/known
- Hide upcasted duplicates (e.g. Healing Word at 1st/2nd/3rd should collapse)
- Quick "cast at level X" picker inline without opening full spell card

**Recommendation:** Small lift, high daily value. Good warmup task before the bigger DM features.

---

#### P1-3. ⚔️ DM Combat Encounter Panel
**Why:** DMs currently have no single screen to run a fight. Most-requested category across all community research.

**Scope:**
- DM-only view inside the campaign: initiative order with drag-to-reorder
- HP bars and conditions for all PCs visible at a glance
- Add NPCs/monsters from existing Claude lookup into the encounter
- Track legendary actions, lair actions, concentration per creature
- "Next turn" button advances initiative, flags any end-of-turn effects

**Recommendation:** Build alongside P1-1 (they share the "DM can see party state" foundation).

---

#### P1-4. 📱 PWA Offline Mode (Phase 2)
**Why:** Table wifi is unreliable. Service worker skeleton already exists — this completes it.

**Scope:**
- Cache character sheet data on load (read-only when offline)
- Queue writes (HP changes, spell slot usage) and sync on reconnect
- "You're offline" banner with degraded-mode indicator

**Recommendation:** Relatively contained. Finish before adding more features — every new feature needs to consider offline state anyway.

---

### Priority 2 — High Value, More Effort

---

#### P2-1. 🎒 Party Loot / Item Distribution
**Why:** Real end-of-session workflow gap. No existing tool handles this well.

**Scope:**
- DM "gives" one or more items (from SRD search or custom) to selected party members
- Item appears in the target character's inventory automatically
- Optional shared "party chest" model — items sit in a campaign stash until claimed
- DM can reclaim/move items between characters

**Recommendation:** Build after the DM combat panel — shares the same "DM acts on player data" infrastructure.

---

#### P2-2. 📖 Rules Quick-Reference (Claude-Powered)
**Why:** D&D Beyond is building this for 2026. You can ship it now using your existing Claude cache infrastructure.

**Scope:**
- New panel (sidebar or modal) — type a rules question, get a cited answer
- "Does using a Bonus Action spell break my Action spell?" → Claude responds with PHB reference
- Cache responses in existing `ClaudeCache` table (type: `rules`)
- Available to all users, not just DM

**Recommendation:** Mostly a new UI surface — backend is ~20 lines. High perceived value, low effort.

---

#### P2-3. 🌟 Session XP / Milestone Tracker
**Why:** Closes the loop between sessions and character progression. Campaign system has the sessions — they just don't drive character growth yet.

**Scope:**
- After a session, DM marks XP earned (numeric) or milestone (checkbox)
- If milestone: triggers level-up prompt for all campaign members
- If XP: accumulates per character, auto-prompts level-up when threshold hit
- XP history visible per character (which sessions earned what)

**Recommendation:** Builds naturally on top of the existing Campaign + SessionLog models.

---

### Priority 3 — Nice to Have

---

#### P3-1. 🔒 Content Gating Per Campaign
**Why:** Commonly requested by DMs who want to enforce specific rulesets or restrict subclass options.

**Scope:**
- DM sets per-campaign rules: 2014 vs. 2024 content, approved races/classes/subclasses
- Character creation and level-up modal respect those gates for members of that campaign
- DM can grant exceptions per character

---

#### P3-2. 🌀 Custom Conditions
**Why:** Standard 15 conditions don't cover homebrew or narrative effects.

**Scope:**
- DM (or player) defines named conditions with a description and optional mechanical effect note
- Custom conditions appear in the same condition tracker UI alongside standard ones
- Campaign-scoped (shared across members) or character-scoped

---

#### P3-3. 🎲 Dice Roll History Log
**Why:** Players love receipts. Useful for "wait, what did I roll?" disputes at the table.

**Scope:**
- Persistent log of all dice rolls: timestamp, character, roll type (attack/skill/save/damage), result
- Visible per character in a new "History" sub-panel or collapsible footer
- Does not need to be global/shared — per-character is enough

---

#### P3-4. 📤 Character Export (PDF / JSON)
**Why:** Backup and portability. Low urgency for a closed group but good defensive hygiene.

**Scope:**
- JSON export: full character data dump, importable to restore or migrate
- PDF: the existing print styles are already there — formalize into an "Export PDF" button that triggers a clean print view

---

### ❌ Explicitly Out of Scope

- **VTT / Maps** — massive scope, better tools exist (Foundry, Roll20)
- **Voice / Video chat** — use Discord
- **3D dice** — fun, zero functional value
- **Native mobile app (Phase 3)** — PWA offline (P1-4) is sufficient for this group size

---

### (Legacy) ⚔️ Campaign System — Original Spec (Partially Complete)

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

### ✅ 3. 🧹 Full Repository Audit & Cleanup (2026-05-06)

Audit confirmed the codebase was already clean from prior refactors. One remaining fix applied:
- Fixed stale `@/lib/db` import in `scripts/sync-open5e.ts` and `scripts/sync-dnd5eapi.ts` → corrected to `@/lib/prisma`
- All dead files (Navbar.tsx, NavbarServer.tsx, auth/session.ts, api/dev/*, CharactersClient.tsx) already removed
- `ensureUserExists()` already removed
- `@eaDir/` and `public/uploads/` confirmed in .gitignore
- No TODO/FIXME comments remaining

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
