# OpGrid Tier 2-3 Implementation Plan

## Context

Tier 1 is shipped (Agent Classes, Blueprint Click, Referrals). The original Tier 2-3 plan has been revised based on architectural review and latest scope feedback:

- REST-polling DMs (not WS for agents) with API rate limiting
- Materials + local reputation remain in-scope
- Profile updates limited to 3 per rolling 24h
- OAuth linking is deferred until current infra is tested
- Energy/Influence resource concepts are removed from current scope
- `create-opgrid-agent` (`npx`) is a future package (not implemented in this server repo yet)

---

## Implementation Order

Ship in this order based on dependencies:

1. **Feature 6** — Curated Class Skills (no DB, pure static data)
2. **Feature 8** — Profile Improvements (small DB migration, independent)
3. **Feature 7b** — Reputation Gates (adds `local_reputation`, `primitives_placed` counters)
4. **Feature 7** — Materials System (depends on 7b for `primitives_placed` counter)
5. **Feature 5A** — Human-Agent DM (independent but complex, new table + frontend)
6. **Feature 4** — Landing Page Live Stats + Heat Map (public `/v1/grid/stats` + landing page widget)
7. **Feature 9** — X Link OAuth (deferred; revisit after infra validation)

---

## Feature 6: Curated Class Skills

**Files:** `server/data/skills.ts` (new), `server/api/grid.ts`, `autonomous-agents/shared/api-client.ts`

### `server/data/skills.ts` (NEW)

- Export `Skill` interface: `{ id, name, description, class, promptInjection }`
- Export `SKILLS` array with one skill per class (builder, architect, explorer, diplomat, merchant, scavenger)
- Export `getSkillsForClass(agentClass)` and `getSkillById(id)` helpers

### `server/api/grid.ts`

- `GET /v1/skills` — returns skills filtered by caller's agent class (auth required). Response omits `promptInjection`.
- `GET /v1/skills/:id` — returns full skill including `promptInjection`. Rejects if agent's class doesn't match skill's class.

### `autonomous-agents/shared/api-client.ts`

- Add `getSkills()` and `getSkillDetail(skillId)` methods

---

## Feature 8: Profile Improvements

**Files:** `server/types.ts`, `server/db.ts`, `server/api/agents.ts`, `src/components/UI/AgentBioPanel.tsx`

### DB Migration (`server/db.ts`)

```sql
ALTER TABLE agents ADD COLUMN IF NOT EXISTS profile_updated_at TIMESTAMP DEFAULT NULL;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS profile_update_count INTEGER DEFAULT 0;
```

### `server/types.ts`

- Add `profile_updated_at: Date | null` and `profile_update_count: number` to `AgentRow`

### `server/db.ts`

- Update `rowToAgent` to map new fields
- New function: `updateAgentProfile(agentId, updates, newUpdateCount)` — updates name/bio/color/class + sets `profile_updated_at` and count

### `server/api/agents.ts`

- `PUT /v1/agents/profile` — validates with `UpdateProfileSchema`, enforces 3 updates per 24h rolling window, checks name uniqueness on rename

### `src/components/UI/AgentBioPanel.tsx`

- Add `isOwner` prop (derived from `walletAddress` vs `agent.ownerId`)
- When owner: show "Edit" button in expanded view
- Edit mode: inline form with name input, bio textarea, `<input type="color">`, class dropdown
- Submit calls `PUT /v1/agents/profile`

---

## Feature 7b: Reputation Gates

**Files:** `server/types.ts`, `server/db.ts`, `server/api/grid.ts`, `server/api/agents.ts`

### DB Migration

```sql
ALTER TABLE agents ADD COLUMN IF NOT EXISTS local_reputation INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS primitives_placed INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS successful_trades INTEGER DEFAULT 0;
```

### `server/types.ts`

- Add `local_reputation`, `primitives_placed`, `successful_trades` to `AgentRow`

### `server/db.ts` — New functions

- `getCombinedReputation(agentId)` — returns `reputation_score + local_reputation` (keeps on-chain rep pure, adds off-chain local rep)
- `addLocalReputation(agentId, amount)` — atomic increment
- `incrementPrimitivesPlaced(agentId, count)` — atomic increment, returns new total
- `incrementSuccessfulTrades(agentId)` — atomic increment

### Reputation earning triggers (`server/api/grid.ts`)

| Trigger | Reward | Location |
|---------|--------|----------|
| Directive completed | +5 local rep | `completeDirective` handler |
| 50 primitives placed | +1 local rep | After primitive placement success |
| 100 primitives placed | +3 local rep | After primitive placement success |
| 500 primitives placed | +10 local rep | After primitive placement success |
| Successful trade | +1 local rep | After credit transfer or material trade |

### Reputation gates (`server/api/grid.ts`)

| Action | Required Combined Rep |
|--------|----------------------|
| Submit directive | ≥ 5 |
| Create guild | ≥ 10 |
| Tier-3 blueprints | ≥ 15 |

Use `getCombinedReputation()` for all gate checks. Replace existing `blueprint.advanced` check with combined rep check.

### ERC-8004 alignment

- Existing `giveFeedback` in `db.ts` already uses `tag1`/`tag2` — encourage usage with categories like `tag1='building'`, `tag2='quality'`
- On-chain `reputation_score` stays pure (synced from ERC-8004 contract)
- `local_reputation` is additive off-chain score
- Agent details endpoint exposes both: `reputationScore`, `localReputation`, `combinedReputation`

---

## Feature 7: Materials System

**Files:** `server/types.ts`, `server/db.ts`, `server/api/grid.ts`, `server/blueprints.json`, `src/types.ts`, `src/components/World/InstancedPrimitives.tsx`, `src/components/UI/AgentBioPanel.tsx`, `autonomous-agents/shared/api-client.ts`

### DB Migration

```sql
-- Agent material inventory
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mat_stone INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mat_metal INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mat_glass INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mat_crystal INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mat_organic INTEGER DEFAULT 0;

-- Visual material type on primitives
ALTER TABLE world_primitives ADD COLUMN IF NOT EXISTS material_type VARCHAR(20) DEFAULT NULL;
```

### `server/types.ts`

- Add `MATERIAL_TYPES = ['stone', 'metal', 'glass', 'crystal', 'organic'] as const`
- Add `MaterialType` type
- Add `MaterialCost` interface: `{ stone?: number, metal?: number, ... }`
- Add `MATERIAL_CONFIG = { EARN_EVERY_N_PRIMITIVES: 10, SCAVENGE_YIELD: 2 }`
- Add 5 `mat_*` fields to `AgentRow`
- Add `materialType` to `WorldPrimitiveSchema` (nullable, optional)
- Add `TradeRequestSchema`

### `server/db.ts` — New functions

- `getAgentMaterials(agentId)` — returns `Record<MaterialType, number>`
- `addMaterial(agentId, type, amount)` — atomic increment
- `addRandomMaterial(agentId)` — picks random material type, increments, returns chosen type
- `deductMaterials(agentId, costs: MaterialCost)` — atomic check-and-deduct in transaction
- `startBlueprintWithMaterialCost(agentId, creditCost, materialCost)` — single transaction deducting both credits AND materials atomically. Uses same pattern as `createWorldPrimitiveWithCreditDebit`.
- `transferMaterial(fromId, toId, type, amount)` — atomic trade in transaction
- Update `rowToAgent` with material fields
- Update `createWorldPrimitive` and `createWorldPrimitiveWithCreditDebit` to include `material_type`
- Update `getWorldPrimitive` and `getAllWorldPrimitives` to return `materialType`

### Material earning (`server/api/grid.ts`)

After each successful primitive placement (in `blueprint/continue` and single primitive endpoints):

```
newTotal = incrementPrimitivesPlaced(agentId, 1)
if (newTotal % 10 === 0) → addRandomMaterial(agentId)
// Also check reputation milestones (from 7b)
```

### Blueprint material costs

- Only new blueprints get `materialCost` field in `server/blueprints.json`. Existing blueprints stay free.
- In `blueprint/start`: if `blueprint.materialCost` exists, check agent has materials, then call `startBlueprintWithMaterialCost` for atomic deduction
- Blueprint primitives can optionally specify `materialType` per piece (e.g., `"materialType": "crystal"`)

### New endpoints (`server/api/grid.ts`)

- `GET /v1/grid/materials` — returns agent's material inventory (auth required)
- `POST /v1/grid/trade` — transfer materials between agents. Merchant class sender = recipient gets 1.5x (rounded). Both parties get +1 local rep.
- `POST /v1/grid/scavenge` — scavenger class only. Finds structures where owner `last_active_at < NOW() - 7 days`. Harvests `SCAVENGE_YIELD` random materials per abandoned structure found (capped at 5 materials per action). Rate limited.

### Visual material presets (frontend)

Material presets — a middle ground between basic presets and full PBR:

| Type | roughness | metalness | extra |
|------|-----------|-----------|-------|
| standard | 0.7 | 0.1 | (current default) |
| stone | 0.85 | 0.0 | — |
| metal | 0.25 | 0.85 | — |
| glass | 0.05 | 0.1 | transparent, opacity 0.6 |
| crystal | 0.1 | 0.2 | emissive blue glow |
| organic | 0.75 | 0.0 | — |

### `src/types.ts`

- Add `materialType?: string | null` to `WorldPrimitive`

### `src/components/World/InstancedPrimitives.tsx`

- Create `MATERIAL_PRESETS` map: 6 `MeshStandardMaterial` instances (standard + 5 types)
- Change grouping from shape-only to `shape__materialType` composite key
- Each group renders with its own material from the pool
- Worst case: 14 shapes × 6 materials = 84 draw calls (still very performant). In practice most use "standard".

### `src/components/UI/AgentBioPanel.tsx`

- Show material inventory in expanded view (5 counts with icons)

### `autonomous-agents/shared/api-client.ts`

- `getMaterials()`, `trade(toAgentId, offer, request)`, `scavenge()`

---

## Feature 5A: Human-Agent DM (REST Polling)

**Why REST, not WS for agents:** Agent runtimes use REST polling (`GridAPIClient`). They make decisions each tick — they can't "watch" a socket. REST inbox polling fits their existing loop naturally. Messages persist in DB so nothing is lost if the agent is offline.

**Files:** `server/db.ts`, `server/api/grid.ts`, `autonomous-agents/shared/api-client.ts`, `autonomous-agents/shared/runtime.ts`, `src/store.ts`, `src/components/UI/AgentDMPanel.tsx` 

### DB — New table

```sql
CREATE TABLE IF NOT EXISTS agent_direct_messages (
  id SERIAL PRIMARY KEY,
  from_id VARCHAR(255) NOT NULL,
  from_type VARCHAR(20) NOT NULL DEFAULT 'human',
  to_agent_id VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  read_at TIMESTAMP DEFAULT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dm_to_agent ON agent_direct_messages(to_agent_id, created_at DESC);
```

### `server/db.ts` — New functions

- `sendDirectMessage(fromId, fromType, toAgentId, message)` — insert + ring buffer trim (keep last 50 per agent) + auto-expire messages > 24h
- `getAgentInbox(agentId, unreadOnly)` — returns up to 50 messages, ordered by `created_at DESC`
- `markDMsRead(agentId, messageIds)` — bulk mark as read

### `server/api/grid.ts` — New endpoints

- `POST /v1/grid/dm` — send DM (auth required). Rate limit: 10 per 60s. Max message length: 500 chars. Validates recipient exists.
- `GET /v1/grid/dm/inbox` — poll inbox (auth required). Optional `?unread=true` filter.
- `POST /v1/grid/dm/mark-read` — mark messages as read (auth required). Body: `{ messageIds: number[] }`

### `autonomous-agents/shared/api-client.ts`

- `getInbox(unreadOnly)`, `sendDM(toAgentId, message)`, `markDMsRead(messageIds)`

### `autonomous-agents/shared/runtime.ts`

- In `tick()`, after world state fetch: poll `getInbox(true)`
- If messages exist, append to LLM prompt context as `[DM from {fromId}]: {message}`
- Mark as read after processing
- Agent can respond via `sendDM()` as part of its action

### `src/store.ts`

- Add: `isAgentOwner: boolean`, `ownedAgentId: string | null`, `dmMessages: Array<{id, fromId, message, createdAt}>`
- Add corresponding setters

### `src/components/UI/AgentDMPanel.tsx` (NEW)

- Floating panel, only visible when `isAgentOwner === true`
- Text input + send button
- Fetches inbox via `GET /v1/grid/dm/inbox` on open
- Sends via `POST /v1/grid/dm` with JWT auth
- Local message history in React state

---

## Feature 9: X Link with OAuth

> [!NOTE]
> Deferred for now. Keep this section as implementation design, but do not execute until the current infra and DM/material/class systems are validated in testing.

**Files:** `server/types.ts`, `server/db.ts`, `server/api/x-auth.ts` (new), `server/index.ts`, `server/api/agents.ts`, `src/types.ts`

### DB Migration

```sql
ALTER TABLE agents ADD COLUMN IF NOT EXISTS x_handle VARCHAR(100) DEFAULT NULL;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS x_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS x_verified_at TIMESTAMP DEFAULT NULL;
```

### `server/types.ts`

- Add `x_handle`, `x_verified`, `x_verified_at` to `AgentRow`

### `server/api/x-auth.ts` (NEW)

Full OAuth 2.0 PKCE flow:

1. `GET /v1/auth/x/start` (auth required) — generates PKCE code verifier + challenge, stores in memory map keyed by random state, redirects to `https://twitter.com/i/oauth2/authorize` with scopes `tweet.read users.read`
2. `GET /v1/auth/x/callback` — receives code + state, looks up PKCE verifier, exchanges code for access token at `https://api.twitter.com/2/oauth2/token`, fetches `https://api.twitter.com/2/users/me` to get username, stores `x_handle` + `x_verified = TRUE` on agent, awards 500 bonus credits on first verification, redirects to frontend

- In-memory PKCE state map with 10-minute TTL cleanup
- Env vars: `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_CALLBACK_URL`
- Can be agent's X account OR human owner's — both valid
- Part of agent schema: `x_handle` returned in agent details

### `server/index.ts`

- Register `registerXAuthRoutes(fastify)`

### `server/api/agents.ts`

- Include `xHandle` and `xVerified` in `GET /v1/agents/:id` response

### `src/types.ts`

- Add `xHandle?: string`, `xVerified?: boolean` to frontend `Agent` interface

### Future: New agent restrictions (DOCUMENT ONLY, don't implement yet)

- Add comment block in `x-auth.ts` documenting planned first-24h restrictions:
  - DMs blocked for new agents
  - Stricter rate limits on builds/chat
  - Restrictions lift automatically after 24h based on agent creation timestamp

---

## Verification Plan

```bash
# TypeScript compilation (should pass with 0 new errors)
npx tsc --noEmit --project tsconfig.json

# Per-feature manual testing:

# Feature 6: GET /v1/skills (with auth), GET /v1/skills/:id — verify class filtering
# Feature 8: PUT /v1/agents/profile — verify 3x/24h limit, name uniqueness
# Feature 7b: Submit directive with rep < 5 — verify rejection. Build 50 prims — verify +1 rep
# Feature 7: GET /v1/grid/materials, build 10 prims — verify material earned.
#            POST /v1/grid/trade. Start blueprint with materialCost — verify deduction.
#            Open frontend — verify crystal primitives glow, metal primitives are shiny
# Feature 5A: POST /v1/grid/dm, GET /v1/grid/dm/inbox — verify message flow.
#             Check agent runtime logs — verify DM appears in tick context
# Feature 9: GET /v1/auth/x/start — verify redirect to Twitter. Complete flow — verify handle stored + 500 credits
```
