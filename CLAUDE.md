# CLAUDE.md

Context for future Claude sessions. Read first.

## What this is

**Isle of Cambrera** — single-player, turn-based, browser 2D civ-builder. Refugees from a continent-destroying war found a settlement on the northern island of **Cambrera**, growing toward a kingdom. Inspired by *Hamurabi*, *Civilization*, *Lords of the Realm II*, *Master of Orion* (poor tiles should still matter).

> Full lore in `memory/project_cambrera_lore.md` — read before adding events, flavor, or hostiles.

**Design constraints (don't violate without asking):**
- Turn-based, 1 turn = 1 year. Seasonal pacing is later.
- **Low fantasy**, medieval → renaissance. Magic is *fading*. No high-fantasy spell systems.
- Single-player, browser-first. Mobile via Capacitor wrapper later — don't rewrite.
- Open-ended. Soft goal = kingdom. No hard win condition.
- Staged complexity: early = resources/exploration, mid = combat, late = diplomacy. Don't skip ahead.
- **Pops are abstract à la Stellaris** — UI never commits to a literal headcount. 1 grass tile ≈ 10 hectares.

## Dev commands

```bash
npm install        # first time only
npm run dev        # Vite dev :5173 with HMR
npm run build      # tsc --noEmit + vite build → dist/
npm run preview    # serve dist/ locally
npx tsc --noEmit   # type-check only
```
Node ≥ 18.

## Stack

- TypeScript (strict, noUnusedLocals + noUnusedParameters)
- Vite 5
- HTML Canvas for map, DOM overlay for UI
- localStorage saves, single slot. Key: `isle-of-cambrera-save-v25`. **Bump on any breaking state-shape change.** Old saves must fail loud → `newGame()`, never silent NaN/undefined.
- **No engine, no UI framework.** React if UI complexity demands. Don't reach for Phaser/Pixi/Godot. Turn-based tile game is ~70% UI, ~30% rendering — engine wouldn't earn its weight.

Version history: git log + README. This file = current state only.

## Mechanics

### Pops

`{ age, lifespan, founder? }`. See `Pop` in `types.ts`. **Pops age, not a counter** — aging creates the food-priority pressure (babies don't pay back immediately, growth must be earned).

**Three age phases:**
- **Child** — `age < ADULT_AGE = 14`. Eats `FOOD_PER_CHILD = 1`. No work, no reproduction.
- **Adult (fertile)** — `14 ≤ age < ELDER_AGE = 35`. Eats `FOOD_PER_ADULT = 2`. Works, reproduces.
- **Elder** — `age ≥ 35`. Eats 2. No reproduction. Works/rests per `state.elderPolicy`.

`LIFESPAN_RANGE = [35, 55]`, mean ≈ 45. Steady-state pop ≈ 45 puts Long House gate (25) in mid-game. **Don't shorten lifespan/elder age** — old [25,40] + ELDER_AGE=25 had a 6-year non-working tail that collapsed pop by ~year 60.

- `STARTER_AGE_RANGE = [15, 22]` — 5 starter adults, lifespan floored at `age + STARTER_LIFESPAN_FLOOR_BONUS = 10`. **Don't remove this floor** — preserves randomness without permitting total collapse by bad roll.
- `STARTER_CHILD_AGE_RANGE = [0, 4]` — 2 children.
- `NEWCOMER_AGE_RANGE = [15, 22]` — event/boat/wave refugees arrive as fresh adults.
- Babies via `makeBabyPop()` at age 0.
- **Founder flag is starter-only.** `MORALE_FOUNDER_EXTRA = -3` on top of base death morale (old-age, famine). Decays as starters age out. (Bandits no longer kill — see Bandits section.)

**Helpers (state.ts):** `isChild`/`isFertile`/`isElder`, `childCount`/`fertileCount`/`elderCount`. `adultCount = fertileCount + elderCount` (food consumption — elders eat like adults). Allocator/idle/scout cap/boat dispatch use `fertileCount`. **New pop-consuming mechanics:** check the cohort — feeding = adults+elders, working/growing = fertile only.

**Famine kills youngest first** (sort age ASC, accumulate per-age food shortfall). Dead child = 14 years lost labor — delayed productivity debt, not immediate crisis. Keeps food the perpetual priority.

**Bandits steal food, not lives** — see "Bandits (Exarum stragglers)" section. The older death-on-raid version was retired in v0.7.5; if a future raid escalation re-adds death, do it as a separate event (`bandits_severe`) rather than mutating the base raid.

**Growth gate:** baby born at end-of-year if `pop > 0 && pop < popCapacity && food ≥ pop × 3 && morale ≥ MORALE_GROWTH_GATE = 50`. `popCapacity = INITIAL_HUT_CAPACITY (25) + houses × 6`. Hard cap; refugees bypass, births don't. The 1.5 yrs of food reserve is generous on purpose — newborn = 4-yr productivity debt.

**Idle-adult birth bonus:** after standard rule, each idle adult rolls `IDLE_ADULT_BIRTH_CHANCE = 0.05`, total capped at `BONUS_BIRTH_CAP = 1`. Probabilistic (verified in `sim/birth_death_curve.py`). **Don't change to integer formulation** without re-running the sim.

**Elder decision** (`state.pendingElderDecision`): fires once when `state.elderTransitions ≥ ELDER_DECISION_TRIGGER = 5`. Blocks end-year (modal `#elder-overlay`).
- **working**: +`ELDER_WORK_FOOD_YIELD = 0.5` food/elder/yr; one-time `MORALE_ELDER_WORK_CHOICE = -3`.
- **respected**: no labour; one-time `MORALE_ELDER_RESPECTED_CHOICE = +5`.

Handlers: `acceptElderWork` / `respectElders`. Revisitable via Governance — each flip re-applies the same morale cost.

**Child decision** (`state.pendingChildDecision`): fires once when Long House built AND `childCount ≥ CHILD_DECISION_TRIGGER = 3` AND `childPolicy === null`. Modal `#child-overlay`. Long House gate guarantees Governance exists and prevents collision with elder decision.
- **working**: +`CHILD_WORK_FOOD_YIELD = 0.5` food + `CHILD_WORK_WOOD_YIELD = 0.3` wood/child/yr (floored at apply); one-time `MORALE_CHILD_WORK_CHOICE = -4`.
- **free**: no labour; one-time `MORALE_CHILD_FREE_CHOICE = +3`.

Handlers: `setChildrenWorking` / `setChildrenFree`. Revisitable via Governance.

**`projectedYields` consumption uses next turn's ages** (step 0 ages everyone before step 5 eating). Don't revert to current ages — topbar lies otherwise.

### Tiles — states, yields, reach, allocator

**State machine:**
```
wild ──assign──▶ cultivating ──1yr──▶ worked ──0 workers──▶ fallow ──2yr──▶ wild
                       │                  │                     │
                       │                  └──reserve=0──▶ exhausted (permanent)
                       └──pull last──▶ wild (cancelled)
```

Always transition through `cultivating`/`fallow`. Two exceptions:
- **Starter workers** drop into `worked` directly — settlers prepared ground; year 1 shouldn't be a punishing zero-yield turn.
- **Fishers** go `wild ↔ worked` directly. Don't reintroduce cultivating for fishers — variance + narrative ("you cast nets, not till them") are the features.

**Yields per worker (worked):**
- **Farmer** (grass): `2 + tile.fertility` food/yr. Break-even on baseline grass — surplus needs fertile tiles, working children, or events. **Don't bump base farmer yield;** "good land is a real resource" is load-bearing.
- **Woodcutter** (forest): 2 wood/yr. No reserve drain — timber regrows.
- **Hunter** (forest): 3 food/yr, drains `tile.reserve`. Net +1. `gameExhausted = true` evicts hunters when reserve = 0.
- **Fisher** (beach/river): random — `FISHER_YIELD_BASE = [1,3]`, `FISHER_YIELD_RICH = [2,4]` on `fishRichness: 1` tiles (`FISH_RICH_CHANCE = 0.2`). No reserve, no cultivation.
- **Quarryman** (stone): 1 stone/yr, drains reserve.

**Forest dual slots:** `tile.hunterWorkers` for hunters, `workers - hunterWorkers` for woodcutters. Both coexist up to capacity. Game exhaustion closes hunter slot only; woodcutters keep going.

**Food-job triad must stay differentiated.** Hunter = transitory drain, farmer = sustainable + compounding via fertility, fisher = variable. Don't let hunters refill game or fishers have reserves — triad collapses.

**Shed order in famine:** scout → quarryman → woodcutter → hunter → fisher → farmer. **Furthest-tile-first** within each job — close-in productive work preserved.

**Hidden reserves** (forest 30–120, stone 60–240). Surprise exhaustion is hunter/quarryman only. Capacity stays visible.

**Grass fertility** (`FERTILE_GRASS_CHANCE = 0.3`): each grass rolls `0|1` at gen. +1 food on fertile. Visible on discovery. `ensureFertileNearTown` guarantees ≥1 fertile within `BASE_REACH`.

**Rivers:** 5 tiles. Grass within Chebyshev-1 of a river → fertile via `applyRiverFertility` post-tile-creation sweep. Rivers themselves fishable (capacity 1–2).

**Capacity (visible on discovery):** grass 2–8, forest 2–6, stone 1–4, river 1–2. Variable capacity (Master of Orion–style) — poor tiles must stay useful (outposts, watchtowers later).

**Reach.** Workable if Chebyshev distance ≤ `BASE_REACH = 2` from town, OR ≤ `WORKED_REACH = 1` from any worked or road tile. Working the edge extends reach — visible territorial sprawl without a district system. 1 tile ≈ 316 m; 2 tiles ≈ 630 m honest unassisted walking range.

**Allocator.** `+job` auto-claims nearest eligible. `findEligibleTile` sorts by `tileBonusForJob` DESC (fertility for farmer, fishRichness for fisher), then distance ASC. `-job` pulls from **furthest** tile. Player never manually places workers (only chooses count).

**Scouts** don't occupy tiles. Reveal `SCOUT_REVEAL_PER_YEAR × scouts` frontier tiles/turn. `+Scout` disabled when no frontier remains. Auto-retire active scouts when last frontier revealed (chronicle: "The island is fully mapped.").

**Starter guarantees:** `ensureForestNearTown` + `ensureFishingNearTown` — settlers picked a site with game and water.

### Morale

0–100 (`MORALE_START = 80`, clamped via `applyMorale`). **Lagging indicator — no passive drift.** Quiet year leaves morale where it is. Anti-Sim-decay-meter — **don't add passive drain** without a fresh conversation.

**Deltas:**
- Food: surplus +2 / deficit −3.
- Famine: −5/pop. Old-age: `MORALE_OLD_AGE_DEATH = 2`/pop, +`MORALE_FOUNDER_EXTRA = 3`/founder. **Shrine of Anata softens** to 1 / +2 (`ANATA_OLD_AGE_MORALE`/`ANATA_FOUNDER_EXTRA`).
- Coming-of-age: +2. Birth: +2.
- Events: bountiful +5, locusts −4, mild_winter +3, bandits (−3 on theft, −2 if stores empty), newcomers (accept +4 / reject −3), forest_fire −3, anata_sacrifice (+5 accept / −3 decline). Scripted waves: accept +4, reject −3.
- Long House: +8 one-time.

**Gates:**
- `MORALE_GROWTH_GATE = 50` — births only at/above. **Load-bearing** — "no babies if morale cracks."
- `MORALE_ATTRACT_THRESHOLD = 80` — newcomers weight ×2.
- `MORALE_PREY_THRESHOLD = 30` — bandits weight ×2.

**Don't add more gates** (production/build/trade) without conversation. Religion/shrines extend via helpers or `turn.ts` step — not the events table.

**UI:** "Mood" chip (≥70 green, 40–69 gold, <40 red).

### Rescue boat

`state.boat: { status, returnYear, crew }`. Lets the player *choose* to invest 2 adults + 2 yrs for refugees, vs the random newcomers trickle.

- **Status:** `"docked" | "voyage" | "scrapped" | "lost"`. `"scrapped"` from departure wizard. `"lost"` is terminal — **don't regress to docked.**
- `dispatchBoat()` takes 2 idle adults (youngest first). `BOAT_VOYAGE_YEARS = 2`.
- Crew ages at sea (step 0.5). Old-age deaths possible. They don't eat at home.
- **Return:** per-crew `effectiveCrewLossChance(state)` roll, then weighted refugee count `BOAT_REFUGEE_WEIGHTS = [2,4,3,1]` for 0/1/2/3 (adults via `makeNewcomerPop`).
- All crew lost → `status: "lost"`.

Narrative: how you find the *other* war survivors. Keep log thematic.

### Fishing XP

`state.fishingYears` accumulates current fisher count/turn. Reduces ship crew-loss.
- `FISHING_XP_GATE = 2`: no bonus below.
- `FISHING_XP_PER_STEP = 3`: each 3 fisher-yrs = +1% reduction.
- `FISHING_LOSS_MIN = 0.03`: absolute floor — fishing never makes voyages safe.
- Base `BOAT_CREW_LOSS_CHANCE = 0.10`; bonus caps at −7%.
- `fishingLossReduction(years)` / `effectiveCrewLossChance(state)` for ship panel.

Intent: gives fishing strategic depth without dethroning farming.

### Buildings

One-time, `types.ts:BUILDINGS`, `state.buildings: Record<BuildingId, boolean>`. `build()` subtracts cost + flips flag.

| Building | Cost | Gate | Bonus | Blocks |
|---|---|---|---|---|
| Granary | 30 food, 15 wood | — | +0.5 food/farmer/yr | locusts |
| Palisade | 20 wood, 25 stone | — | — | bandits |
| Well | 10 wood, 15 stone | — | — | forest_fire |
| Hunting Lodge | 10 wood | — | +0.5 food/hunter/yr | — |
| Lumber Camp | 10 wood, 10 stone | — | +0.5 wood/woodcutter/yr | — |
| Mason's Workshop | 15 wood, 10 stone | — | +0.5 stone/quarryman/yr | — |
| Long House | 20 wood, 15 stone | 25 pops | +8 morale; newcomers ×3 (with attract); unlocks stone roads + houses + Governance | — |
| Shrine of Anata | 10 wood, 15 stone | 4 old-age deaths | Softens old-age morale (2→1, founder 3→2); enables `anata_sacrifice` event | — |
| Chicken Coop | 5 wood, 3 stone | — | Flock 5; +0.5 food/bird/yr; auto-cull at cap=20 | — |
| Dock | 12 wood, 15 stone | Long House | +`DOCK_SELL_BONUS = 1` gold/unit on merchant sells (food/wood 2g, stone 3g); buy rates unchanged | — |

**Houses** (repeatable, not in BUILDINGS): `HOUSE_COST_BASE = { wood: 8, stone: 3 }` for the first; each subsequent house costs `+HOUSE_COST_INCREMENT = { wood: 2, stone: 1 }` over the previous via `nextHouseCost(state)`. +`HOUSE_CAPACITY = 6` cap, +`HOUSE_FOOD_YIELD = 2` food/yr garden plot. Long House gate. API: `canBuildHouse`/`buildHouse`/`houseBlockerReason`/`nextHouseCost`. **Don't flatten the cost** — escalation prevents the late-game "grind wood for unbounded huts" loop.

**Pop cap:** `INITIAL_HUT_CAPACITY (25) + houses × 6`. Blocks **births only**; refugees push past. Cap raised 20→25 to break the deadlock at the Long House gate.

**Blocker mechanism:** events carry `blockedBy: BuildingId` + `blockedText`. `rollEvent` returns `blockedText` as good-tone log, skips `apply`. Blocked roll still consumes the slot — averted line *is* the event.

**Disabled-button tooltips:** every building/house button uses `buildBlockerReason`/`houseBlockerReason`. **Extend the helpers, not per-building branches in ui.ts.**

**Costs by intent:**
- Granary uses food — early surplus needs a sink.
- Palisade/Well use wood+stone — forces farmers → woodcutters/quarrymen.
- **Hunting Lodge is a trap** — dead weight once forests exhaust. Cheap on purpose.
- **Lumber Camp / Mason's Workshop** — productivity multipliers (mirror Granary/Lodge shape, +0.5 floored). Address tester complaint that wood and especially stone bottleneck the build economy. Mason still respects finite stone reserves; the workshop lifts the *ceiling*, doesn't make seams infinite.

**No durability** — buildings don't wear out. Don't add unless raid escalation specifically targets structures.

**Long House notes:**
- Pop gate is **total pops** including children (25 = a real community).
- Persists if pop drops below 25 — institutions don't unlearn governance.
- Unlocks stone roads + houses + Governance + future civic buildings. Dirt paths are **not** gated — they're available from turn 1.
- Newcomer multiplier ×3 stacks with attract bonus (vs ×2 either alone).
- Future Frostpunk-style civic decisions trigger off Long House — **add a decision system, don't wire into events.**

**Extension:** new building = add `BuildingId`, append BUILDINGS, optionally tag an event with `blockedBy`/`blockedText`. Chronicle prose lives in `src/narratives.ts`.

### Hidden buildings + unlock chronicle

`isBuildingHidden(state, id)` hides any building whose blocker starts with `"Requires"`/`"Needs"` (gate blockers). Resource blockers (`"Short:"`) stay visible — players need the savings target.

**Long House always visible** — major civic milestone, hiding it loses the goal.

**Unlock chronicle:** `state.unlockedBuildings` tracks which gates have announced. `checkBuildingUnlocks` runs end-of-`endYear` after growth; if gate satisfied first time, set flag + emit `BUILDING_UNLOCK_TEXT[id]` from `narratives.ts`. One-shot per save.

Shrine of Anata uses legacy `ANATA_UNLOCK_LINE` (step 0 when `oldAgeDeathsTotal` crosses threshold). **Don't add to `BUILDING_UNLOCK_TEXT`** — `checkBuildingUnlocks` skips it explicitly.

Initial `unlockedBuildings` = `true` for non-gated buildings.

### Town Center upgrades

Lightweight repeatable layer outside one-time `BUILDINGS`. Two from turn 1; tier 3 reserved for Long House (Market Square / Civic Hall stub).

`state.townUpgrades: Record<TownUpgradeId, boolean>`. `TOWN_UPGRADES` (types.ts).

| Upgrade | Cost | Yield |
|---|---|---|
| Communal Garden | 5 food, 5 wood | +1 food/yr |
| Workshop Yard | 8 wood, 5 stone | +1 wood/yr |

**Integer yields, not fractional** — legible. Fractional stays per-pop modifiers (granary, lodge, working children/elders) where averaging makes sense.

API: `townUpgradeBlockerReason`/`canBuildTownUpgrade`/`buildTownUpgrade`. Yields applied at step 1.

**Intent:** addresses the "100% farming, 0 wood/stone" dead end. Workshop Yard gives slow trickle so build economy doesn't flatline; small enough that real production still pays.

### Governance (civic decisions)

"Governance" row in build column when `buildings.long_house === true`. Modal `#governance-overlay` lists active laws (elder + child policy) with toggle buttons.

**Re-application cost:** every flip applies the same morale delta. Frostpunk pattern — laws change, but each change carries friction. **Don't add free-first-flip or cooldown.**

**Where decisions live:**
- First-time elder: turn.ts step 0, `#elder-overlay`, `acceptElderWork`/`respectElders`.
- First-time child: end of turn, `#child-overlay`, `setChildrenWorking`/`setChildrenFree`.
- Revisit: `#governance-overlay`, `toggleElderPolicy`/`toggleChildPolicy`.

**Future civic decisions** (taxation, military, religion) belong here, **not in events.ts.** Add field on GameState, gate it (likely Long House or future civic), entry in governance modal, toggle handler in turn.ts.

### Roads

Two tiers, both tile-targeted (click tile → button). `tile.roadType: "none" | "dirt" | "stone"`. Per-tile, instant, permanent.

- **Dirt path** — `DIRT_PATH_COST = { wood: 3 }`. Ungated; available from turn 1. Acts as a `DIRT_PATH_REACH = 1` anchor (same as a worked tile). Designed to fix the "stone tile out of reach before Long House" early lock.
- **Stone road** — `STONE_ROAD_COST = { wood: 2, stone: 5 }`. **Long House gated.** Acts as a `STONE_ROAD_REACH = 2` anchor — highways. Can be paved over an existing dirt path on the same tile (player UI says "Pave with Stone").
- Tile must be in reach — no leapfrogging. Not on water/mountain.
- Both extend reach **without** a worker stationed; neither produces yields.
- Town tile auto-paves with `roadType = "stone"` when the Long House is built.
- Render: dirt path = thin packed-earth bands; stone road = wider band with cobble dashes.

**Why the split:** the original single-tier road locked roads behind the Long House, but stone tiles often need to be reached *before* the Long House to even build it. Dirt paths solve the chicken-and-egg without making the Long House irrelevant — only stone roads have the +2 reach.

**API:** `canBuildRoad(state, x, y, kind)` / `buildRoad(state, x, y, kind)` / `roadCost(kind)`. **`kind` is required** — don't reintroduce a no-arg version.

### Chicken coop

Settlement-level (no tile, no worker).

- Build (5 wood, 3 stone) → `chickens = CHICKEN_STARTING_FLOCK = 5`, `chickenCapacity = CHICKEN_CAP_INITIAL = 20`.
- Step 1: `floor(chickens × CHICKEN_EGG_FOOD_RATE = 0.5)` food. Flock grows `max(1, floor(chickens × CHICKEN_GROWTH_RATE = 0.4))`/yr. Surplus auto-culls at cap → `CHICKEN_SLAUGHTER_FOOD = 1` food/bird. One-shot first-cull notification.
- Cap expansion not yet implemented.

### Bandits (Exarum stragglers)

Reflavored from "highland raiders." Bandits are now war refugees from the Exarum continent — same lineage as the player's settlers, but they came ashore elsewhere on Cambrera and turned to theft. They **steal food, not lives**.

- `BANDIT_THEFT_RANGE = [5, 15]` — stolen amount rolled per raid, capped at current food.
- `MORALE_BANDIT_THEFT = -3` when food is taken; `MORALE_BANDIT_EMPTY = -2` when stores were already empty (still demoralising).
- Palisade still blocks the event entirely (averted line in chronicle).
- **Don't reintroduce death-on-raid** without a fresh design conversation. Smaller recoverable shock keeps the threat present without the demographic gut-punch the older design caused.

### Anata sacrifice (food-sink event)

`anata_sacrifice` event — only fires when `state.buildings.shrine_of_anata === true` (gated via `adjustedWeight`). Pause-style, like merchants/refugees: writes `state.pendingAnataSacrifice = true` and blocks End Year until resolved.

- **Accept** (`acceptAnataSacrifice`): `min(ANATA_SACRIFICE_FOOD_COST = 15, state.food)` food consumed; `+ANATA_SACRIFICE_MORALE_GAIN = 5` morale.
- **Decline** (`declineAnataSacrifice`): no food cost; `ANATA_SACRIFICE_DECLINE_MORALE = -3` morale.
- UI: `#anata-overlay` modal in index.html, handler `maybeShowAnataSacrificeModal` in ui.ts (pattern matches elder/child decisions).
- End Year status string: "Priests at the shrine…" while pending.

**Why it's here:** addresses tester feedback that the game lacked food sinks. Built on the existing pause-event pattern rather than a new system.

### Merchant trade modal (Patrician cargo model)

`merchants` event sets `state.merchantVisit: MerchantVisit | null`. `maybeShowTradeModal` (called from `redraw()`) opens `#trade-overlay`.

**`MerchantVisit`:** `{ cargoCapacity, sellStock }`. `rollMerchantVisit(state)` in events.ts. Cargo and stock ranges are tier-keyed, not flat.

**Trade reputation tiers.** `state.tradeReputation` counts completed trades (declines and empty baskets don't count — counter rewards engaging, not getting lucky). `merchantTierFromReputation(rep)` maps it to a tier; both events.ts (initial roll) and turn.ts (second-ship handoff) read it.

| Tier | Trades completed | Cargo range | Stock units | Notes |
|---|---|---|---|---|
| 0 | 0–2 | `MERCHANT_CARGO_BY_TIER[0] = [8, 12]` | `[2, 4]` | Baseline |
| 1 | 3–6 | `[10, 15]` | `[3, 5]` | Chronicle beat on first crossing |
| 2 | 7+ | `[12, 18]` | `[4, 6]` | Chronicle beat + rare "two ships" variant |

Tier thresholds in `MERCHANT_TIER_THRESHOLDS = [3, 7]`. **Don't smooth-scale per-trade** (+1 cargo invisible) — keep the step function.

**Two-ships variant** (tier 2 only): when `merchants` fires, ~`MERCHANT_TWO_SHIPS_CHANCE = 0.25` chance to set `state.merchantSecondShipPending = true`. After the first visit resolves (deal *or* decline), `maybeArrangeSecondShip` in turn.ts re-rolls `state.merchantVisit`, clears the flag, pushes a "second ship makes port the same season" log entry. The existing `maybeShowTradeModal` redraw loop handles the rest — no async needed.

**Reputation increment** is in `executeTradeBasket` only. `declineTrade` does not advance the counter (but the second ship still arrives if pending — they came regardless of the first deal).

**Trade basket:** `sellTotal ≤ cargoCapacity − stockTotal + buyTotal`. Buying frees slots so player can sell more in the same visit. Resources: food, wood, stone.

**Rates** (`TRADE_RATES`): sell food/wood 1g, stone 2g; buy food/wood 2g, stone 4g. Asymmetric.

**Dock building (`DOCK_SELL_BONUS = 1`):** Long House gated, 12 wood / 15 stone. When `state.buildings.dock === true`, `effectiveSellRates(state)` adds +1g/unit to every sell (food/wood become 2g, stone 3g). Buy rates are unchanged — better seller, not savvier buyer. `basketGoldDelta(state, basket)` reads the effective rates; **the state parameter is required** — don't reintroduce a state-less version.

**End Year blocked while `merchantVisit !== null`** ("Merchants waiting…"). Decline costs nothing — tension is "spend now or wait for cheaper."

**Object-based pause, not async.** Saves stay plain JSON. Future pause-style events (raid-or-tribute) follow same nullable-field pattern.

**Circular dep guard:** `rollMerchantVisit` and `merchantTierFromReputation` are **exported from events.ts**. turn.ts imports from events.ts (`fireScriptedWave`/`rollEvent`/`rollMerchantVisit`/`merchantTierFromReputation`); **events.ts must never import from turn.ts.** Keep boundary clean.

### Scripted Exarum-survivor waves

Four one-shot narrative events scheduled at `newGame()`. Targets `SCRIPTED_WAVE_TARGETS = [5, 10, 20, 35]` ± `SCRIPTED_WAVE_JITTER = 3`, ordering enforced by `SCRIPTED_WAVE_MIN_GAP = 3`. Live on `state.scriptedWaves`.

At step 4, if year matches and `fired === false`, **replaces** random event roll, spawns `SCRIPTED_WAVE_REFUGEES = 2` adults, writes lore log entry. Narrative in `events.ts:SCRIPTED_WAVE_TEXT` — keep canonical names from `memory/project_cambrera_lore.md`.

- **Replace, not augment** — avoids "survivors + locusts" mixed turns.
- 2 adults = same as random `newcomers` so the arc doesn't snowball.
- **Both waves and random newcomers are optional** — set `state.pendingRefugees`, modal prompts accept (+4) or decline (−3). Accepted refugees arrive next year. Boat crew/finds still automatic — your own people returning.
- `fired` flag (not cleared array) needed for save/load.
- Wave 4 (~yr 35): Bura exiles, news of Captain Amezcua's senility.
- Extension: new `ScriptedWaveId`, append targets, write text + brief pending text.

### Departure wizard

Six-step pre-game wizard. `state.departure: DepartureChoices` persists. Copy in `ui.ts:WIZARD_NARRATIVES`.

| Step | Choices | Effect |
|---|---|---|
| 1 Brought | seeds / fishing / provisions | Resource bonus |
| 2 Companion | craftsman (+6w +4s) / wisewoman (+2f +5 morale) / nobody (+5f) | — |
| 3 Timing | prepared (+5w +3s) / hasty | `pursuedRisk` if prepared |
| 4 Alarm | grab (+7f) / cast off | `pursuedRisk` if grab |
| 5 Landing | western_shore (6,6) / southern_cove (6,10) / northern_strand (7,3) | `buildIsland(landingPos)` |
| 6 Ship | keep / salvage (+12w, scrapped) / burn (+4w, scrapped, clears pursuit) | Sets `Boat.status = "scrapped"` |

Landing before ship — narrative beat: make landfall first, then decide the vessel's fate.

**Bandit pursuit:** `isPursued(state)` = `(timing===prepared OR alarm===grab) AND shipFate!==burn`. Doubles bandit weight years 1–5. Burning ship clears trail.

`DepartureChoices` is open-ended — future hooks read fields directly without data-shape churn.

### Intro papyrus

`#intro-overlay` parchment with backstory. Hidden by default. `maybeShowIntro()` un-hides on first load + after New Game unless `localStorage["isle-of-cambrera-skip-intro"] === "1"`. CSS-only, no game-state impact.

### Chronicle (log)

- Newest on top (unshift).
- `tone: "neutral" | "good" | "bad"` for CSS.
- `renderLog` brackets same-year entries in `.year-group` with `.year-header` ("— Year N —").
- **Single population tally per turn.** Elder deaths, coming-of-age, births → `tally` object → one combined line via `emitPopulationTally`. **Don't fold famine/bandit/event deaths into tally** — they need own tonal emphasis.
- **Cap = 2000 entries.** ~80 chars each → ~160 KB worst case; comfortable in localStorage.

### Chronicle export + post-mortem feedback

- **Export Chronicle** button (`#export-chronicle-btn`) downloads `state.log` as `cambrera-chronicle-yearN.txt`. Oldest first (reading order), with metadata header. `serializeChronicle(state)` in ui.ts is sole source — also reused by feedback attach.
- **Include chronicle** checkbox (`#fb-include-chronicle`) attaches serialized text to feedback POST. Client trims to 256 KB; worker rejects above 512 KB.
- **Game-over auto-prompt:** redraw after `state.gameOver` flips opens feedback modal with attach pre-checked + alternate intro line. One-shot via `state.gameOverFeedbackShown`. Skipped if any blocking modal pending.
- **Worker schema** (`feedback-worker/schema.sql`): `chronicle TEXT` column. Migration noted in `feedback-worker/instructions.md`. Dashboard renders in `<details>`.

## Turn pipeline (src/turn.ts)

```
0.   Age pops; old-age deaths; log coming-of-age; reconcile
0.5  Boat — age crew; resolve voyage if returnYear reached
1.   Yields from worked tiles; drain reserves; exhaust depleted; accumulate fishingYears
2.   Scouts reveal frontier; auto-retire if no frontier remains
3.   Advance tile states (cultivating→worked, worked→fallow, fallow→wild)
4.   Scripted wave (if due) OR random event
5.   Food consumption; chronicle line; famine kills (youngest first)
6.   Reconcile (shed workers if adults died — scout first, then furthest)
7.   Growth check (food ≥ pop × 3 AND morale ≥ 50 → +1 baby)
8.   Population tally; game-over check; year++
```

**Order matters:**
- Step 0 first: age changes (deaths, coming-of-age) before anything depending on adult count.
- Step 0.5: boat after home aging, before yields — returning crew counts toward this turn's food.
- Step 3 < 4: cultivating tiles don't yield this turn.
- Step 4 < 5: food events settle before famine check, keeping food display truthful.
- Reconcile at 0 (elders) and 6 (famine) — one cleanup per pop delta.

**Topbar `projectedYields`** counts worked + cultivating, ignores reserves/events. Capacity estimate, responsive to +button clicks.

## File-by-file

```
index.html          Topbar, canvas, sidebar, all overlays, music <audio>.
src/main.ts         Entry. Save load / newGame, click handler, redraw().
src/types.ts        Types + tuning constants. **Tune numbers here first.** VERSION + AUTHOR.
src/map.ts          ISLAND[] + buildIsland(landingPos). Reach + eligible-tile helpers.
src/state.ts        newGame, placeStarterWorker, applyMorale (clamp), count helpers, projectedYields.
src/events.ts       EventDef + roll. adjustedWeight (morale, Long House, pursuit). SCRIPTED_WAVE_TEXT. isPursued.
src/turn.ts         endYear pipeline. assign/unassign, reconcile, trade basket, fishing XP, town upgrades, civic handlers, isBuildingHidden.
src/render.ts       Canvas: terrain × state colors, decor layers, road crosshatch.
src/ui.ts           DOM overlays. renderUI, intro, wizard, trade, governance, help modal, music.
src/help.ts         HELP_SECTIONS. **Update with mechanic changes** — out-of-date help is worse than none.
src/narratives.ts   Chronicle prose (unlock, town upgrade, civic flip, job tooltips). Keep prose out of turn.ts.
src/style.css       Retro palette: muted browns, gold accents, monospace.
public/music/       Music served at /music/* (not bundled). gemini_iron_under_snow.mp3.
```

**Help text is part of the player contract.** Whenever you change a mechanic in turn.ts/types.ts/state.ts, update the matching `src/help.ts` section.

## Conventions

- No comments unless WHY is non-obvious. Identifier names carry WHAT.
- Edit `types.ts` constants over hardcoding numbers elsewhere.
- Canvas coords pixel-based — tile (x,y) → `x*TILE_SIZE, y*TILE_SIZE`.
- New event → weight proportional to desired frequency.
- Tile-interacting mechanics → respect state machine, never skip `cultivating`/`fallow`.
- State-shape change → bump `SAVE_KEY`. Old saves fail loud → `newGame()`.

## Roadmap

See README.md → *Roadmap*, GitHub issues on `vicosurge/survival-civ-game`. **Don't add roadmap work without the user's say-so.**

## Memory

`/root/.claude/projects/-mnt-backups-civ-game/memory/`:
- **project_civ_game.md** — design brief, locked decisions
- **user_vicente.md** — collaboration prefs
- **feedback_maintain_docs.md** — keep README + CLAUDE.md current
- **project_playtest_notes.md** — playtest feedback log
- **project_cambrera_lore.md** — canonical names, places, factions

Skim before nontrivial changes. Update CLAUDE.md + README.md in the same turn as notable changes.
