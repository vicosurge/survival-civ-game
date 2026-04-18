import { buildIsland, currentWorkers, findEligibleTile } from "./map";
import {
  ADULT_AGE,
  FOOD_PER_ADULT,
  FOOD_PER_CHILD,
  GameState,
  Job,
  LIFESPAN_RANGE,
  MORALE_MAX,
  MORALE_MIN,
  MORALE_START,
  NEWCOMER_AGE_RANGE,
  Pop,
  SAVE_KEY,
  SCRIPTED_WAVE_JITTER,
  SCRIPTED_WAVE_MIN_GAP,
  SCRIPTED_WAVE_TARGETS,
  ScriptedWave,
  ScriptedWaveId,
  STARTER_AGE_RANGE,
  YIELD_PER_WORKER,
} from "./types";

function randInt(lo: number, hi: number): number {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

export function makeStarterPop(): Pop {
  const age = randInt(STARTER_AGE_RANGE[0], STARTER_AGE_RANGE[1]);
  // Floor remaining life so the whole cohort can't die before the first baby
  // matures — bad luck shouldn't kill the settlement before it has a chance.
  const lifespan = Math.max(age + 6, randInt(LIFESPAN_RANGE[0], LIFESPAN_RANGE[1]));
  return { age, lifespan };
}

export function makeStarterChild(): Pop {
  const age = randInt(0, 2);
  return { age, lifespan: randInt(LIFESPAN_RANGE[0], LIFESPAN_RANGE[1]) };
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

export function newGame(): GameState {
  const { tiles, town } = buildIsland();
  const starterPops: Pop[] = [
    ...Array.from({ length: 5 }, () => makeStarterPop()),
    makeStarterChild(),
    makeStarterChild(),
  ];
  const state: GameState = {
    year: 1,
    pops: starterPops,
    food: 30,
    wood: 18,
    stone: 5,
    gold: 5,
    morale: MORALE_START,
    tiles,
    town,
    scouts: 1,
    boat: { status: "docked", returnYear: null, crew: [] },
    scriptedWaves: rollScriptedWaves(),
    pendingMerchant: false,
    buildings: { granary: false, palisade: false, well: false },
    log: [
      {
        year: 1,
        text: "A small band of refugees beaches on Cambrera's southern shore. They break ground on farmsteads near the landing — food, first and foremost.",
        tone: "neutral",
      },
    ],
    gameOver: false,
    selectedTile: null,
  };

  placeStarterWorker(state, "farmer");
  placeStarterWorker(state, "farmer");
  placeStarterWorker(state, "farmer");
  // No starter woodcutter — food is the priority; player decides where the
  // remaining adult goes (more farming, scouting, quarrying, or resting).

  return state;
}

function placeStarterWorker(state: GameState, job: "farmer" | "woodcutter" | "quarryman"): void {
  const slot = findEligibleTile(state, job);
  if (!slot) return;
  const tile = state.tiles[slot.y][slot.x];
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

export function adultCount(state: GameState): number {
  return state.pops.filter((p) => p.age >= ADULT_AGE).length;
}

export function childCount(state: GameState): number {
  return state.pops.length - adultCount(state);
}

export function assignedTotal(state: GameState): number {
  return (
    currentWorkers(state, "farmer") +
    currentWorkers(state, "woodcutter") +
    currentWorkers(state, "quarryman") +
    state.scouts
  );
}

// Idle *adults* — children can't work.
export function idleCount(state: GameState): number {
  return adultCount(state) - assignedTotal(state);
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
export function projectedYields(state: GameState): {
  food: { production: number; consumption: number; net: number };
  wood: number;
  stone: number;
} {
  let foodProd = 0, woodProd = 0, stoneProd = 0;
  for (let y = 0; y < state.tiles.length; y++) {
    for (let x = 0; x < state.tiles[y].length; x++) {
      const t = state.tiles[y][x];
      if (t.state !== "worked" && t.state !== "cultivating") continue;
      if (t.workers <= 0) continue;
      if (t.terrain === "grass") foodProd += t.workers * (YIELD_PER_WORKER.farmer + t.fertility);
      else if (t.terrain === "forest") woodProd += t.workers * YIELD_PER_WORKER.woodcutter;
      else if (t.terrain === "stone") stoneProd += t.workers * YIELD_PER_WORKER.quarryman;
    }
  }
  const foodCons = adultCount(state) * FOOD_PER_ADULT + childCount(state) * FOOD_PER_CHILD;
  return {
    food: { production: foodProd, consumption: foodCons, net: foodProd - foodCons },
    wood: woodProd,
    stone: stoneProd,
  };
}
