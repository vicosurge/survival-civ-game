export const VERSION = "v0.4.4";
export const AUTHOR = "Vicente Muñoz";

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
// Woodcutter and hunter both work forest and can coexist on the same tile.
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
  capacity: number;       // max workers this tile can hold; 0 for non-workable terrain
  workers: number;        // currently assigned workers (0..capacity); includes both hunters and woodcutters
  hunterWorkers: number;  // forest only: subset of workers that are hunters; woodcutters = workers - hunterWorkers
  gameExhausted: boolean; // forest only: game reserve depleted — hunter slot permanently closed, woodcutters may remain
  reserve: number;        // remaining resource units (forest game / quarry stone); 0 for grass/beach/river
  fertility: number;      // grass tiles only: +0 normal, +1 fertile — adds to per-worker farmer yield
  fishRichness: number;   // beach/river only: +0 normal (rolls 1–3 food/worker), +1 rich (rolls 2–4, crab/tuna)
  yearsInState: number;   // how long in current state — drives cultivating→worked and fallow→wild
  road: boolean;          // a road has been built here — acts as a reach anchor like a worked tile
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
  founder?: boolean;
}

// The rescue boat. The settlers arrived in it; now it can be dispatched to
// comb the region for other refugees of the same war. While at sea, the crew
// is held here (not in state.pops) so they don't consume food at home.
export interface Boat {
  status: "docked" | "voyage" | "scrapped" | "lost";  // scrapped = ship fate burned/salvaged; lost = all crew died at sea
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

export type BuildingId = "granary" | "palisade" | "well" | "hunting_lodge" | "long_house";

// Long House civic building requirements and effect.
export const LONG_HOUSE_POP_GATE = 25;
export const LONG_HOUSE_MORALE_BONUS = 8;

// Road construction cost per tile. Requires Long House + tile in reach.
export const ROAD_COST = { wood: 2, stone: 5 };

export interface BuildingDef {
  id: BuildingId;
  name: string;
  description: string;
  cost: { food?: number; wood?: number; stone?: number; gold?: number };
}

// Starting origin — chosen before the first turn, applies resource bonuses and
// is stored on state for future event hooks (e.g. fishing origin → richer catches).
// The companion and departure-sequence choices are a planned later milestone;
// this type and the ORIGINS table are the architectural foundation for that work.
export type OriginId = "seeds" | "fishing" | "provisions";

export interface OriginDef {
  id: OriginId;
  name: string;
  flavor: string;       // one sentence shown on the selection card
  bonusText: string;    // mechanical summary shown under the flavor
  startingBonus: Partial<Record<"food" | "wood" | "stone" | "gold", number>>;
}

export const ORIGINS: Record<OriginId, OriginDef> = {
  seeds: {
    id: "seeds",
    name: "Seeds & Farming Tools",
    flavor: "Drought has ruined our home, but perhaps the northern lands will be fertile.",
    bonusText: "+10 food — a season's seed-stock and field tools.",
    startingBonus: { food: 10 },
  },
  fishing: {
    id: "fishing",
    name: "Fishing Tackle & Rope",
    flavor: "The soil may be dust, but the sea will provide what ground cannot.",
    bonusText: "+8 food, +4 wood — nets, hooks, and cordage from the hull stores.",
    startingBonus: { food: 8, wood: 4 },
  },
  provisions: {
    id: "provisions",
    name: "Preserved Provisions",
    flavor: "All the food we could find, trade for, or steal — sealed against the voyage.",
    bonusText: "+20 food — heavy clay jars and smoked stores. Starvation kills faster than cold.",
    startingBonus: { food: 20 },
  },
};

// ─── Departure sequence ───────────────────────────────────────────────────────
// The six-step pre-game wizard. Each step is a binary or ternary choice that
// accumulates resource bonuses and sets flags (pursuedByBandits, scrapped boat).
// DepartureChoices is stored on GameState.departure so future events/mechanics
// can reference how this particular game was set up.
// Narrative text lives in ui.ts (clearly marked PLACEHOLDER for Vicente to swap).

type ResourceBonus = Partial<Record<"food" | "wood" | "stone" | "gold", number>>;

export type CompanionId = "craftsman" | "wisewoman" | "nobody";
export interface CompanionDef {
  id: CompanionId;
  name: string;
  bonusText: string;
  startingBonus: ResourceBonus;
  moraleDelta: number;
}
export const COMPANIONS: Record<CompanionId, CompanionDef> = {
  craftsman: {
    id: "craftsman", name: "A Skilled Craftsman",
    bonusText: "+6 wood, +4 stone — a blacksmith's tools and a head for load-bearing joints.",
    startingBonus: { wood: 6, stone: 4 }, moraleDelta: 0,
  },
  wisewoman: {
    id: "wisewoman", name: "A Wisewoman & Midwife",
    bonusText: "+2 food, +5 morale — she packed carefully and keeps the group steady.",
    startingBonus: { food: 2 }, moraleDelta: 5,
  },
  nobody: {
    id: "nobody", name: "Turn them away",
    bonusText: "+5 food — fewer mouths; their share went back in the hold.",
    startingBonus: { food: 5 }, moraleDelta: 0,
  },
};

export type DepartureTimingId = "prepared" | "hasty";
export interface DepartureTimingDef {
  id: DepartureTimingId;
  name: string;
  bonusText: string;
  startingBonus: ResourceBonus;
  pursuedRisk: boolean;
}
export const DEPARTURE_TIMINGS: Record<DepartureTimingId, DepartureTimingDef> = {
  prepared: {
    id: "prepared", name: "Keep packing",
    bonusText: "+5 wood, +3 stone — loaded properly. Word will have spread that you were leaving.",
    startingBonus: { wood: 5, stone: 3 }, pursuedRisk: true,
  },
  hasty: {
    id: "hasty", name: "Leave now",
    bonusText: "No extra supplies — whatever you grabbed in the dark is what you have.",
    startingBonus: {}, pursuedRisk: false,
  },
};

export type AlarmResponseId = "grab" | "run";
export interface AlarmResponseDef {
  id: AlarmResponseId;
  name: string;
  bonusText: string;
  startingBonus: ResourceBonus;
  pursuedRisk: boolean;
}
export const ALARM_RESPONSES: Record<AlarmResponseId, AlarmResponseDef> = {
  grab: {
    id: "grab", name: "Go back for supplies",
    bonusText: "+7 food — cellar stores and smoked meat, grabbed at a run. They saw you.",
    startingBonus: { food: 7 }, pursuedRisk: true,
  },
  run: {
    id: "run", name: "Cast off now",
    bonusText: "Nothing extra. You made it out clean — they didn't see which way you went.",
    startingBonus: {}, pursuedRisk: false,
  },
};

export type ShipFateId = "keep" | "salvage" | "burn";
export interface ShipFateDef {
  id: ShipFateId;
  name: string;
  bonusText: string;
  startingBonus: ResourceBonus;
  scrapped: boolean;
  clearsPursuit: boolean;
}
export const SHIP_FATES: Record<ShipFateId, ShipFateDef> = {
  keep: {
    id: "keep", name: "Keep her moored",
    bonusText: "No extra resources — but the ship stays. You can send crew to look for survivors.",
    startingBonus: {}, scrapped: false, clearsPursuit: false,
  },
  salvage: {
    id: "salvage", name: "Break her down for timber",
    bonusText: "+12 wood — three days and tired arms. The ship is gone.",
    startingBonus: { wood: 12 }, scrapped: true, clearsPursuit: false,
  },
  burn: {
    id: "burn", name: "Salvage what you can, then burn her",
    bonusText: "+4 wood — the smoke kept them off your trail for a week.",
    startingBonus: { wood: 4 }, scrapped: true, clearsPursuit: true,
  },
};

export type LandingSpotId = "western_shore" | "southern_cove" | "northern_strand";
export interface LandingSpotDef {
  id: LandingSpotId;
  name: string;
  bonusText: string;
  town: { x: number; y: number };
}
export const LANDING_SPOTS: Record<LandingSpotId, LandingSpotDef> = {
  western_shore: {
    id: "western_shore", name: "Western Shore",
    bonusText: "Sheltered cove. Forest to the south, stone outcrops inland.",
    town: { x: 6, y: 6 },
  },
  southern_cove: {
    id: "southern_cove", name: "Southern Cove",
    bonusText: "River delta. Fertile floodplain, good fishing — but further from the mountain.",
    town: { x: 6, y: 10 },
  },
  northern_strand: {
    id: "northern_strand", name: "Northern Strand",
    bonusText: "Exposed north coast. Dense forest close by, but colder and more isolated.",
    town: { x: 7, y: 3 },
  },
};

export interface DepartureChoices {
  origin: OriginId;
  companion: CompanionId;
  timing: DepartureTimingId;
  alarm: AlarmResponseId;
  shipFate: ShipFateId;
  landingSpot: LandingSpotId;
}

// Years after game start that the "pursued by bandits" flag raises bandit event weight.
export const BANDIT_PURSUIT_YEARS = 5;

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
  departure: DepartureChoices;  // every choice made in the pre-game wizard
  log: LogEntry[];
  gameOver: boolean;
  selectedTile: { x: number; y: number } | null;
  // Cumulative fisher-years. Incremented by current fisher count each turn (step
  //   1). Converts into a crew-loss reduction for ship voyages — see
  //   fishingLossReduction in turn.ts. Maritime experience builds slowly.
  fishingYears: number;
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
// Fishing experience bonus — reduces BOAT_CREW_LOSS_CHANCE per voyage. The
//   settlement's maritime literacy grows as fishers work the shore.
export const FISHING_XP_GATE = 2;          // minimum fisher-years before any bonus
export const FISHING_XP_PER_STEP = 3;      // fisher-years required per additional 1% reduction
export const FISHING_LOSS_MIN = 0.03;      // floor on effective crew loss chance (can never be lower)

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

export const BASE_REACH = 2;       // tiles within this Chebyshev distance of town are always in reach
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

// A merchant visit's order sheet. The player can mix buys and sells in the same
//   visit, bounded by a combined unit cap (TRADE_MAX_PER_VISIT).
export type TradeBasket = Record<TradeAction, Record<TradeResource, number>>;

export function emptyBasket(): TradeBasket {
  return { sell: { food: 0, wood: 0, stone: 0 }, buy: { food: 0, wood: 0, stone: 0 } };
}

export function basketTotal(basket: TradeBasket): number {
  return (
    basket.sell.food + basket.sell.wood + basket.sell.stone
    + basket.buy.food + basket.buy.wood + basket.buy.stone
  );
}

// Positive = settlement gains gold; negative = settlement spends gold.
export function basketGoldDelta(basket: TradeBasket): number {
  let delta = 0;
  const resources: TradeResource[] = ["food", "wood", "stone"];
  for (const r of resources) {
    delta += basket.sell[r] * TRADE_RATES.sell[r];
    delta -= basket.buy[r]  * TRADE_RATES.buy[r];
  }
  return delta;
}

// Morale — a 0–100 settlement-wide stat. Lagging indicator (no passive drift):
// reflects how the year went, not an always-leaking bucket. Gates growth and
// biases event rolls.
export const MORALE_MIN = 0;
export const MORALE_MAX = 100;
export const MORALE_START = 80;
export const MORALE_GROWTH_GATE = 50;       // births only fire at or above this
export const MORALE_ATTRACT_THRESHOLD = 80; // at/above, newcomers event weight ×2
export const MORALE_PREY_THRESHOLD = 30;    // at/below, bandits event weight ×2
export const MORALE_OLD_AGE_DEATH = 2;      // per elder passing of old age
export const MORALE_FOUNDER_EXTRA = 3;      // extra penalty per founder death (stacks with base)

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
  long_house: {
    id: "long_house",
    name: "Long House",
    description: "A great hall where the community gathers to speak and decide together. Raises morale (+8). Word of an organised settlement spreads, drawing more survivors.",
    cost: { wood: 20, stone: 15 },
  },
};

export const SAVE_KEY = "isle-of-cambrera-save-v18";
