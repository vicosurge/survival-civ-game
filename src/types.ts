export type Terrain = "water" | "beach" | "river" | "grass" | "forest" | "stone" | "mountain";

export type Job = "farmer" | "woodcutter" | "quarryman" | "hunter" | "fisher" | "scout";

export const JOBS: Job[] = ["farmer", "hunter", "fisher", "woodcutter", "quarryman", "scout"];

export const JOB_LABEL: Record<Job, string> = {
  farmer: "Farmer",
  woodcutter: "Woodcutter",
  quarryman: "Quarryman",
  hunter: "Hunter",
  fisher: "Fisher",
  scout: "Scout",
};

// What the tile is today. `wild` = untouched terrain. `cultivating` = a worker has
// been assigned but it takes one year to become productive. `worked` = fully
// converted (farmland / logging camp / quarry). `fallow` = worked but abandoned —
// reverts to wild after 2 years of neglect. `exhausted` = forest/quarry drained dry
// (permanent in v0.2).
export type TileState = "wild" | "cultivating" | "worked" | "fallow" | "exhausted";

// Maps production jobs to the terrains they work. Scouts don't occupy tiles.
// Most jobs have a single terrain; fishers work both beach and river.
// Both woodcutter and hunter work forest; tile.job disambiguates which is active.
export const JOB_TERRAINS: Record<Exclude<Job, "scout">, Terrain[]> = {
  farmer: ["grass"],
  woodcutter: ["forest"],
  quarryman: ["stone"],
  hunter: ["forest"],
  fisher: ["beach", "river"],
};

export interface Tile {
  terrain: Terrain;
  discovered: boolean;
  state: TileState;
  capacity: number;    // max workers this tile can hold; 0 for non-workable terrain
  workers: number;     // currently assigned workers (0..capacity)
  reserve: number;     // remaining resource units (forest wood/game / quarry stone); 0 for grass/beach/river
  fertility: number;   // grass tiles only: +0 normal, +1 fertile — adds to per-worker farmer yield
  fishRichness: number; // beach/river only: +0 normal (rolls 1–3 food/worker), +1 rich (rolls 2–4, crab/tuna)
  yearsInState: number; // how long in current state — drives cultivating→worked and fallow→wild
  // Forest tiles only: "woodcutter" = logging camp, "hunter" = hunting camp, null = unassigned.
  // Cleared when workers drops to 0 so a fallow/re-opened tile can switch modes.
  job: Exclude<Job, "scout"> | null;
}

export interface LogEntry {
  year: number;
  text: string;
  tone: "neutral" | "good" | "bad";
}

// A single "pop" is a Stellaris-style abstract unit — not a literal person, but a
// cohort that ages, matures, and eventually dies. Children can't work.
export interface Pop {
  age: number;
  lifespan: number;
}

// The rescue boat. The settlers arrived in it; now it can be dispatched to
// comb the region for other refugees of the same war. While at sea, the crew
// is held here (not in state.pops) so they don't consume food at home.
export interface Boat {
  status: "docked" | "voyage";
  returnYear: number | null;  // end-of-year on which the voyage resolves
  crew: Pop[];                // 2 adults if on voyage; empty when docked
}

export type ScriptedWaveId = "wave1" | "wave2" | "wave3";

// A one-shot narrative event scheduled at newGame() and fired on the year
// rolled. Adds refugees + a lore log entry. Replaces the random-event roll
// for the year it fires.
export interface ScriptedWave {
  id: ScriptedWaveId;
  year: number;
  fired: boolean;
}

export type TradeAction = "sell" | "buy";
export type TradeResource = "food" | "wood" | "stone";

export type BuildingId = "granary" | "palisade" | "well" | "hunting_lodge";

export interface BuildingDef {
  id: BuildingId;
  name: string;
  description: string;
  cost: { food?: number; wood?: number; stone?: number; gold?: number };
}

export interface GameState {
  year: number;
  pops: Pop[];         // replaces the flat population counter
  food: number;
  wood: number;
  stone: number;
  gold: number;
  morale: number;      // 0–100; lagging indicator of how the settlement is faring
  tiles: Tile[][];
  town: { x: number; y: number };
  scouts: number;      // standalone — scouts don't occupy tiles
  boat: Boat;
  scriptedWaves: ScriptedWave[];
  pendingMerchant: boolean;  // merchant visit awaiting trade/decline — blocks end-year
  buildings: Record<BuildingId, boolean>;
  log: LogEntry[];
  gameOver: boolean;
  selectedTile: { x: number; y: number } | null;
}

export const MAP_W = 20;
export const MAP_H = 15;
export const TILE_SIZE = 32;

export const ADULT_AGE = 4;
export const LIFESPAN_RANGE: [number, number] = [10, 15];
// Starter pops are a spread of adult ages so they don't all die in the same year.
export const STARTER_AGE_RANGE: [number, number] = [4, 7];
// Newcomer events arrive as fresh adults partway through life.
export const NEWCOMER_AGE_RANGE: [number, number] = [4, 7];

export const FOOD_PER_ADULT = 2;
export const FOOD_PER_CHILD = 1;

// Per-worker yields when the tile is in `worked` state. Flat rates; tile capacity
// limits *how many workers fit*, not the rate per worker. Fisher is the average
// of the rolled range — actual per-year yield is randomised (see FISHER_YIELD_*).
export const YIELD_PER_WORKER: Record<Exclude<Job, "scout">, number> = {
  farmer: 2,
  woodcutter: 2,
  quarryman: 1,
  // 3 food/year: hunters eat 2 (like any adult), net +1 surplus. Same as a
  // farmer on fertile grass, but finite — the forest reserve is shared with
  // woodcutters and depletes the same way.
  hunter: 3,
  // Projection average. Baseline fishing tile rolls 1–3 food/worker/year
  // (avg 2, break-even), rich tile rolls 2–4 (avg 3, net +1 surplus).
  fisher: 2,
};

// Fisher per-worker yield ranges, rolled fresh each harvest. Variance is the
// point — "sometimes they bring in a lot, sometimes less."
export const FISHER_YIELD_BASE: [number, number] = [1, 3];
export const FISHER_YIELD_RICH: [number, number] = [2, 4];

// Extra food per farmer when a granary is built. 0.5 means an odd farmer count
// rounds down via Math.floor at collection time.
export const GRANARY_FARMER_BONUS = 0.5;

// Extra food per hunter when the hunting lodge is built. Same 0.5 shape as the
// granary bonus. The lodge is a trap — the wood is sunk once forests exhaust.
export const HUNTING_LODGE_HUNTER_BONUS = 0.5;

export const SCOUT_REVEAL_PER_YEAR = 2;

export const BOAT_CREW_SIZE: number = 2;
export const BOAT_VOYAGE_YEARS: number = 2;
// Refugee return distribution: weighted rolls for 0/1/2/3 survivors found.
export const BOAT_REFUGEE_WEIGHTS: [number, number, number, number] = [2, 4, 3, 1];
// Per-crew chance of being lost at sea (rough seas, bandit galleys, bad luck).
export const BOAT_CREW_LOSS_CHANCE = 0.1;

// Random capacity ranges when generating the island. Beach/river are narrow
// working bands — one or two fishers per tile.
export const CAPACITY_RANGE: Record<"grass" | "forest" | "stone" | "beach" | "river", [number, number]> = {
  grass: [2, 8],
  forest: [2, 6],
  stone: [1, 4],
  beach: [1, 2],
  river: [1, 2],
};

// Hidden resource reserves for depletable tiles.
export const RESERVE_RANGE: Record<"forest" | "stone", [number, number]> = {
  forest: [30, 120],
  stone: [60, 240],
};

export const BASE_REACH = 3;       // tiles within this Chebyshev distance of town are always in reach
export const WORKED_REACH = 1;     // additionally, tiles within this distance of any worked tile are in reach
export const FALLOW_REVERT_YEARS = 2;
export const CULTIVATION_YEARS = 1;

// Fraction of grass tiles that roll fertile (+1 food per farmer per year).
export const FERTILE_GRASS_CHANCE = 0.3;

// Fraction of beach/river tiles that roll as rich fishing grounds (crab, tuna,
// shoals) — higher per-year yield range.
export const FISH_RICH_CHANCE = 0.2;

// Scripted Exarum-survivor waves — target years and jitter (±). Rolled at
// newGame() so each playthrough varies while keeping the narrative arc intact.
export const SCRIPTED_WAVE_TARGETS: [number, number, number] = [5, 10, 20];
export const SCRIPTED_WAVE_JITTER = 3;
// Minimum years between consecutive waves (after jitter).
export const SCRIPTED_WAVE_MIN_GAP = 3;
export const SCRIPTED_WAVE_REFUGEES = 2;

// Merchant trade rates — asymmetric so there's a real choice. Sell = settlement
// parts with the resource, receives gold. Buy = settlement spends gold, receives
// the resource.
export const TRADE_RATES: Record<TradeAction, Record<TradeResource, number>> = {
  sell: { food: 1, wood: 1, stone: 2 },
  buy: { food: 2, wood: 2, stone: 4 },
};
export const TRADE_MAX_PER_VISIT = 5;

// Morale — a 0–100 settlement-wide stat. Lagging indicator (no passive drift):
// reflects how the year went, not an always-leaking bucket. Gates growth and
// biases event rolls.
export const MORALE_MIN = 0;
export const MORALE_MAX = 100;
export const MORALE_START = 80;
export const MORALE_GROWTH_GATE = 50;       // births only fire at or above this
export const MORALE_ATTRACT_THRESHOLD = 80; // at/above, newcomers event weight ×2
export const MORALE_PREY_THRESHOLD = 30;    // at/below, bandits event weight ×2

// One-time-purchase settlement upgrades. Each blocks a specific negative event
// (see events.ts: blockedBy + blockedText). No durability; no multiples.
export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  granary: {
    id: "granary",
    name: "Granary",
    description: "A sealed storehouse. Each farmer yields +0.5 food/year. Blocks locusts.",
    cost: { food: 30, wood: 15 },
  },
  palisade: {
    id: "palisade",
    name: "Palisade",
    description: "A wooden wall ringing the settlement. Blocks bandit raids.",
    cost: { wood: 20, stone: 25 },
  },
  well: {
    id: "well",
    name: "Well",
    description: "A stone-lined well beside the timber yards. Blocks wildfires.",
    cost: { wood: 10, stone: 15 },
  },
  hunting_lodge: {
    id: "hunting_lodge",
    name: "Hunting Lodge",
    description: "Drying racks, stretched hides, a pit for rendering fat. Each hunter yields +0.5 food/year — while the forest lasts.",
    cost: { wood: 10 },
  },
};

export const SAVE_KEY = "isle-of-cambrera-save-v12";
