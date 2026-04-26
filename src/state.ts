import { buildIsland, currentWorkers, findEligibleTile } from "./map";
import {
  ADULT_AGE,
  ALARM_RESPONSES,
  CHICKEN_CAP_INITIAL,
  COMPANIONS,
  DEPARTURE_TIMINGS,
  DepartureChoices,
  ELDER_AGE,
  FOOD_PER_ADULT,
  FOOD_PER_CHILD,
  GameState,
  GRANARY_FARMER_BONUS,
  HOUSE_FOOD_YIELD,
  HUNTING_LODGE_HUNTER_BONUS,
  INITIAL_HUT_CAPACITY,
  HOUSE_CAPACITY,
  Job,
  LANDING_SPOTS,
  LIFESPAN_RANGE,
  MAP_H,
  MAP_W,
  MORALE_MAX,
  MORALE_MIN,
  MORALE_START,
  NEWCOMER_AGE_RANGE,
  ORIGINS,
  SHIP_FATES,
  Pop,
  SAVE_KEY,
  SCRIPTED_WAVE_JITTER,
  SCRIPTED_WAVE_MIN_GAP,
  SCRIPTED_WAVE_TARGETS,
  ScriptedWave,
  ScriptedWaveId,
  SHEPHERD_FOOD_YIELD,
  SHEPHERD_WOOL_YIELD,
  STARTER_AGE_RANGE,
  STARTER_CHILD_AGE_RANGE,
  STARTER_LIFESPAN_FLOOR_BONUS,
  YIELD_PER_WORKER,
  CHICKEN_EGG_FOOD_RATE,
} from "./types";

function randInt(lo: number, hi: number): number {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

export function makeStarterPop(): Pop {
  const age = randInt(STARTER_AGE_RANGE[0], STARTER_AGE_RANGE[1]);
  // Floor remaining life so the whole cohort can't die before the first baby
  // matures — bad luck shouldn't kill the settlement before it has a chance.
  const lifespan = Math.max(age + STARTER_LIFESPAN_FLOOR_BONUS, randInt(LIFESPAN_RANGE[0], LIFESPAN_RANGE[1]));
  return { age, lifespan, founder: true };
}

export function makeStarterChild(): Pop {
  const age = randInt(STARTER_CHILD_AGE_RANGE[0], STARTER_CHILD_AGE_RANGE[1]);
  return { age, lifespan: randInt(LIFESPAN_RANGE[0], LIFESPAN_RANGE[1]), founder: true };
}

export function makeBabyPop(): Pop {
  return { age: 0, lifespan: randInt(LIFESPAN_RANGE[0], LIFESPAN_RANGE[1]) };
}

export function makeNewcomerPop(): Pop {
  const age = randInt(NEWCOMER_AGE_RANGE[0], NEWCOMER_AGE_RANGE[1]);
  const lifespan = Math.max(age + 2, randInt(LIFESPAN_RANGE[0], LIFESPAN_RANGE[1]));
  return { age, lifespan };
}

export function rollScriptedWaves(): ScriptedWave[] {
  const ids: ScriptedWaveId[] = ["wave1", "wave2", "wave3"];
  const waves: ScriptedWave[] = [];
  let previous = 0;
  for (let i = 0; i < 3; i++) {
    const target = SCRIPTED_WAVE_TARGETS[i];
    const lo = Math.max(target - SCRIPTED_WAVE_JITTER, previous + SCRIPTED_WAVE_MIN_GAP);
    const hi = target + SCRIPTED_WAVE_JITTER;
    const year = randInt(lo, Math.max(lo, hi));
    waves.push({ id: ids[i], year, fired: false });
    previous = year;
  }
  return waves;
}

export function newGame(departure: DepartureChoices): GameState {
  const { tiles, town } = buildIsland(LANDING_SPOTS[departure.landingSpot].town);

  // Sum resource bonuses from all six departure choices.
  let food = 30, wood = 18, stone = 5, gold = 5;
  const addBonus = (b: Partial<Record<string, number>>): void => {
    food  += b["food"]  ?? 0;
    wood  += b["wood"]  ?? 0;
    stone += b["stone"] ?? 0;
    gold  += b["gold"]  ?? 0;
  };
  addBonus(ORIGINS[departure.origin].startingBonus);
  addBonus(COMPANIONS[departure.companion].startingBonus);
  addBonus(DEPARTURE_TIMINGS[departure.timing].startingBonus);
  addBonus(ALARM_RESPONSES[departure.alarm].startingBonus);
  addBonus(SHIP_FATES[departure.shipFate].startingBonus);

  const morale = MORALE_START + COMPANIONS[departure.companion].moraleDelta;
  const boatScrapped = SHIP_FATES[departure.shipFate].scrapped;

  const starterPops: Pop[] = [
    ...Array.from({ length: 5 }, () => makeStarterPop()),
    makeStarterChild(),
    makeStarterChild(),
  ];
  const state: GameState = {
    year: 1,
    pops: starterPops,
    food,
    wood,
    stone,
    gold,
    morale,
    tiles,
    town,
    scouts: 1,
    boat: boatScrapped
      ? { status: "scrapped", returnYear: null, crew: [] }
      : { status: "docked", returnYear: null, crew: [] },
    scriptedWaves: rollScriptedWaves(),
    merchantVisit: null,
    pendingRefugees: null,
    buildings: { granary: false, palisade: false, well: false, hunting_lodge: false, long_house: false, shrine_of_anata: false, chicken_coop: false },
    houses: 0,
    wool: 0,
    sheepSlaughter: 0,
    sheepSlaughterNotified: false,
    chickens: 0,
    chickenCapacity: CHICKEN_CAP_INITIAL,
    chickenSacrificeNotified: false,
    oldAgeDeathsTotal: 0,
    departure,
    log: [
      {
        year: 1,
        text: "A small band of refugees beaches on Cambrera's shore. Before ploughs turn soil, hunting parties take to the nearer woods — food, first and foremost.",
        tone: "neutral",
      },
    ],
    gameOver: false,
    selectedTile: null,
    fishingYears: 0,
  };

  placeStarterWorker(state, "hunter");
  placeStarterWorker(state, "hunter");
  placeStarterWorker(state, "hunter");
  // 5th adult is intentionally idle — the player decides whether to push for
  // more hunting, scouting, or break the first ground for farming.

  return state;
}

function placeStarterWorker(state: GameState, job: Exclude<import("./types").Job, "scout">): void {
  const slot = findEligibleTile(state, job);
  if (!slot) return;
  const tile = state.tiles[slot.y][slot.x];
  if (job === "hunter") tile.hunterWorkers += 1;
  tile.workers += 1;
  tile.state = "worked";
  tile.yearsInState = 0;
}

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Save failed", e);
  }
}

export function loadGame(): GameState | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GameState;
    if (!parsed.tiles || !Array.isArray(parsed.pops)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

export function applyMorale(state: GameState, delta: number): void {
  state.morale = Math.max(MORALE_MIN, Math.min(MORALE_MAX, state.morale + delta));
}

export function totalPop(state: GameState): number {
  return state.pops.length;
}

// Age-phase predicates — the three-phase system. "adult" here is the bucket
// of pops who have left childhood; it includes elders for consumption purposes
// (they eat like adults). "fertile" is the subset who can actually work and
// reproduce. Keep these distinctions — UI, allocator, boat dispatch, and food
// math all care about different phases.
export function isChild(p: Pop): boolean { return p.age < ADULT_AGE; }
export function isFertile(p: Pop): boolean { return p.age >= ADULT_AGE && p.age < ELDER_AGE; }
export function isElder(p: Pop): boolean { return p.age >= ELDER_AGE; }

export function adultCount(state: GameState): number {
  // Adults for food purposes — includes elders. Used by consumption math.
  return state.pops.filter((p) => p.age >= ADULT_AGE).length;
}

export function fertileCount(state: GameState): number {
  return state.pops.filter(isFertile).length;
}

export function elderCount(state: GameState): number {
  return state.pops.filter(isElder).length;
}

export function childCount(state: GameState): number {
  return state.pops.filter(isChild).length;
}

export function assignedTotal(state: GameState): number {
  return (
    currentWorkers(state, "farmer") +
    currentWorkers(state, "shepherd") +
    currentWorkers(state, "woodcutter") +
    currentWorkers(state, "quarryman") +
    currentWorkers(state, "hunter") +
    currentWorkers(state, "fisher") +
    state.scouts
  );
}

// Total sheep across all active shepherd tiles.
export function sheepHerdTotal(state: GameState): number {
  let total = 0;
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = state.tiles[y][x];
      if (t.terrain === "grass" && t.shepherdWorkers > 0) total += t.sheepHerd;
    }
  }
  return total;
}

// Idle = fertile adults not assigned to a job. Elders don't count — they've
// earned leisure. Children can't work either.
export function idleCount(state: GameState): number {
  return fertileCount(state) - assignedTotal(state);
}

// Hard pop cap: starter huts hold 20 pops. Long-House-gated houses extend it.
// Used by the growth check — births are blocked at cap. Newcomers and refugees
// are NOT gated by capacity (you can't turn away people fleeing for their lives),
// so pop can exceed cap temporarily; you just can't grow it further until the
// next house goes up.
export function popCapacity(state: GameState): number {
  return INITIAL_HUT_CAPACITY + state.houses * HOUSE_CAPACITY;
}

export function jobCount(state: GameState, job: Job): number {
  if (job === "scout") return state.scouts;
  return currentWorkers(state, job);
}

// Projected steady-state yield based on current assignments. Counts both
// `worked` and `cultivating` tiles — so clicking +Farmer updates the projection
// immediately even though a freshly-cultivated tile won't yield until next
// year. Boat crew aren't counted as consumers; reserve depletion isn't clamped.
// Random events aren't projectable — this is a capacity estimate.
//
// Consumption uses *next turn's ages* (age+1): the end-year pipeline ages
// everyone in step 0 before consuming food in step 5, so a child aged 3 today
// will eat as an adult this turn. Also skips pops who will die of old age
// before consumption. Fixes the "displayed ≠ actual" bug where the topbar
// under-counted consumption for pops about to come of age.
export function projectedYields(state: GameState): {
  food: { production: number; consumption: number; net: number };
  wood: number;
  stone: number;
  wool: number;
} {
  let foodProd = 0, woodProd = 0, stoneProd = 0, woolProd = 0;
  for (let y = 0; y < state.tiles.length; y++) {
    for (let x = 0; x < state.tiles[y].length; x++) {
      const t = state.tiles[y][x];
      if (t.state !== "worked" && t.state !== "cultivating") continue;
      if (t.workers <= 0) continue;
      if (t.terrain === "grass") {
        const shepherds = t.shepherdWorkers;
        const farmers = t.workers - shepherds;
        if (farmers > 0) {
          foodProd += farmers * (YIELD_PER_WORKER.farmer + t.fertility + (state.buildings.granary ? GRANARY_FARMER_BONUS : 0));
        }
        if (shepherds > 0) {
          foodProd += shepherds * SHEPHERD_FOOD_YIELD;
          woolProd += shepherds * SHEPHERD_WOOL_YIELD;
        }
      } else if (t.terrain === "forest") {
        if (t.hunterWorkers > 0) {
          const lodgeBonus = state.buildings.hunting_lodge ? HUNTING_LODGE_HUNTER_BONUS : 0;
          foodProd += t.hunterWorkers * (YIELD_PER_WORKER.hunter + lodgeBonus);
        }
        const woodcutters = t.workers - t.hunterWorkers;
        if (woodcutters > 0) woodProd += woodcutters * YIELD_PER_WORKER.woodcutter;
      } else if (t.terrain === "stone") {
        stoneProd += t.workers * YIELD_PER_WORKER.quarryman;
      } else if (t.terrain === "beach" || t.terrain === "river") {
        foodProd += t.workers * (YIELD_PER_WORKER.fisher + t.fishRichness);
      }
    }
  }
  foodProd += state.houses * HOUSE_FOOD_YIELD;
  if (state.buildings.chicken_coop && state.chickens > 0) {
    foodProd += Math.floor(state.chickens * CHICKEN_EGG_FOOD_RATE);
  }

  let futureAdults = 0;
  let futureKids = 0;
  for (const p of state.pops) {
    const futureAge = p.age + 1;
    if (futureAge >= p.lifespan) continue;
    if (futureAge >= ADULT_AGE) futureAdults += 1;
    else futureKids += 1;
  }
  const foodCons = futureAdults * FOOD_PER_ADULT + futureKids * FOOD_PER_CHILD;
  return {
    food: { production: foodProd, consumption: foodCons, net: foodProd - foodCons },
    wood: woodProd,
    stone: stoneProd,
    wool: woolProd,
  };
}
