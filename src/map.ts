import {
  BASE_REACH,
  CAPACITY_RANGE,
  FERTILE_GRASS_CHANCE,
  FISH_RICH_CHANCE,
  GameState,
  Job,
  JOB_TERRAINS,
  MAP_H,
  MAP_W,
  RESERVE_RANGE,
  Terrain,
  Tile,
  WORKED_REACH,
} from "./types";

// Hand-crafted island. 'T' marks the initial town site; everything else maps to Terrain.
// Each row must be exactly MAP_W characters.
//
// River: emerges from the mountain's southern base (11,9) and runs south to a
// small three-tile delta at the south coast (10,11)(11,11)(12,11). Outside
// BASE_REACH of town by design — scouts have something to find.
const ISLAND: string[] = [
  "....................",
  "....................",
  "......~~ggg~~.......",
  ".....~ggfffgg~......",
  "....~gggfffggg~.....",
  "...~ggggffsssgg~....",
  "...~ggTggsmmssgg~...",
  "..~gggggsmmmssggg~..",
  "..~gggfggsmsgggfg~..",
  "..~gggfffggrggfff~..",
  "...~gggggggrgff~....",
  "....~gggggrrr~......",
  ".....~~ggggg~~......",
  "....................",
  "....................",
];

const CHAR_TO_TERRAIN: Record<string, Terrain> = {
  ".": "water",
  "~": "beach",
  "r": "river",
  "g": "grass",
  "f": "forest",
  "s": "stone",
  "m": "mountain",
  "T": "grass",
};

function randInt(lo: number, hi: number): number {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function makeTile(terrain: Terrain): Tile {
  let capacity = 0;
  let reserve = 0;
  let fertility = 0;
  let fishRichness = 0;
  if (terrain === "grass" || terrain === "forest" || terrain === "stone"
      || terrain === "beach" || terrain === "river") {
    const [lo, hi] = CAPACITY_RANGE[terrain];
    capacity = randInt(lo, hi);
  }
  if (terrain === "forest" || terrain === "stone") {
    const [lo, hi] = RESERVE_RANGE[terrain];
    reserve = randInt(lo, hi);
  }
  if (terrain === "grass" && Math.random() < FERTILE_GRASS_CHANCE) {
    fertility = 1;
  }
  if ((terrain === "beach" || terrain === "river") && Math.random() < FISH_RICH_CHANCE) {
    fishRichness = 1;
  }
  return {
    terrain,
    discovered: false,
    state: "wild",
    capacity,
    workers: 0,
    hunterWorkers: 0,
    gameExhausted: false,
    reserve,
    fertility,
    fishRichness,
    yearsInState: 0,
  };
}

export function buildIsland(): { tiles: Tile[][]; town: { x: number; y: number } } {
  if (ISLAND.length !== MAP_H) {
    throw new Error(`Island height ${ISLAND.length} !== MAP_H ${MAP_H}`);
  }
  const tiles: Tile[][] = [];
  let town = { x: 0, y: 0 };
  for (let y = 0; y < MAP_H; y++) {
    const row = ISLAND[y];
    if (row.length !== MAP_W) {
      throw new Error(`Row ${y} has length ${row.length}, expected ${MAP_W}`);
    }
    const tileRow: Tile[] = [];
    for (let x = 0; x < MAP_W; x++) {
      const ch = row[x];
      const terrain = CHAR_TO_TERRAIN[ch];
      if (!terrain) throw new Error(`Unknown map char '${ch}' at (${x},${y})`);
      if (ch === "T") town = { x, y };
      tileRow.push(makeTile(terrain));
    }
    tiles.push(tileRow);
  }
  applyRiverFertility(tiles);
  ensureFertileNearTown(tiles, town);
  ensureForestNearTown(tiles, town);
  ensureFishingNearTown(tiles, town);
  revealAround(tiles, town.x, town.y, 2);
  return { tiles, town };
}

// River banks are lush — every grass tile within Chebyshev 1 of a river tile
// is automatically fertile (+1). Keeps the river's payoff legible on the map
// without needing a separate mechanic.
function applyRiverFertility(tiles: Tile[][]): void {
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (tiles[y][x].terrain !== "river") continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
          const neighbor = tiles[ny][nx];
          if (neighbor.terrain === "grass") neighbor.fertility = 1;
        }
      }
    }
  }
}

// Settlers "picked a good spot" — at least one fertile grass tile must exist
// within base reach of town. If the roll didn't deliver one, promote the
// closest grass tile.
function ensureFertileNearTown(tiles: Tile[][], town: { x: number; y: number }): void {
  let hasFertile = false;
  const grassCandidates: Array<{ x: number; y: number; dist: number }> = [];
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = tiles[y][x];
      if (t.terrain !== "grass") continue;
      const dist = cheby(x, y, town.x, town.y);
      if (dist > BASE_REACH) continue;
      if (t.fertility > 0) hasFertile = true;
      grassCandidates.push({ x, y, dist });
    }
  }
  if (hasFertile || grassCandidates.length === 0) return;
  grassCandidates.sort((a, b) => a.dist - b.dist);
  tiles[grassCandidates[0].y][grassCandidates[0].x].fertility = 1;
}

// Settlers chose a site with hunting grounds nearby — at least one forest tile
// must be visible from the start (within initial reveal radius). If none is,
// promote the nearest in-reach forest tile to discovered.
function ensureForestNearTown(tiles: Tile[][], town: { x: number; y: number }): void {
  const REVEAL_RADIUS = 2;
  let hasVisibleForest = false;
  const forestCandidates: Array<{ x: number; y: number; dist: number }> = [];
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = tiles[y][x];
      if (t.terrain !== "forest") continue;
      const dist = cheby(x, y, town.x, town.y);
      if (dist <= REVEAL_RADIUS) hasVisibleForest = true;
      if (dist <= BASE_REACH) forestCandidates.push({ x, y, dist });
    }
  }
  if (hasVisibleForest || forestCandidates.length === 0) return;
  forestCandidates.sort((a, b) => a.dist - b.dist);
  const { x, y } = forestCandidates[0];
  tiles[y][x].discovered = true;
}

// The landing site is on the coast — there must be at least one fishable tile
// (beach or river) within BASE_REACH of town. Beach tiles ring the island on
// the current map so this is essentially a safety rail for future map edits.
function ensureFishingNearTown(tiles: Tile[][], town: { x: number; y: number }): void {
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = tiles[y][x];
      if (t.terrain !== "beach" && t.terrain !== "river") continue;
      if (cheby(x, y, town.x, town.y) <= BASE_REACH) return;
    }
  }
  // No reachable fishing tile — find the nearest beach and promote one tile
  // into reach by widening discovery (distance check still gates reach, so we
  // can't fudge that; in practice the ring of beaches ensures this branch is
  // never hit on the current map).
  let best: { x: number; y: number; dist: number } | null = null;
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = tiles[y][x];
      if (t.terrain !== "beach") continue;
      const dist = cheby(x, y, town.x, town.y);
      if (best === null || dist < best.dist) best = { x, y, dist };
    }
  }
  if (best) tiles[best.y][best.x].discovered = true;
}

export function revealAround(tiles: Tile[][], cx: number, cy: number, radius: number): number {
  let revealed = 0;
  for (let y = Math.max(0, cy - radius); y <= Math.min(MAP_H - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(MAP_W - 1, cx + radius); x++) {
      if (!tiles[y][x].discovered) {
        tiles[y][x].discovered = true;
        revealed++;
      }
    }
  }
  return revealed;
}

// Reveal N random undiscovered tiles adjacent to the already-discovered frontier.
export function exploreFrontier(tiles: Tile[][], count: number): number {
  const frontier: Array<[number, number]> = [];
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (tiles[y][x].discovered) continue;
      if (hasDiscoveredNeighbor(tiles, x, y)) frontier.push([x, y]);
    }
  }
  let revealed = 0;
  for (let i = 0; i < count && frontier.length > 0; i++) {
    const idx = Math.floor(Math.random() * frontier.length);
    const [x, y] = frontier.splice(idx, 1)[0];
    tiles[y][x].discovered = true;
    revealed++;
  }
  return revealed;
}

function hasDiscoveredNeighbor(tiles: Tile[][], x: number, y: number): boolean {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
    if (tiles[ny][nx].discovered) return true;
  }
  return false;
}

function cheby(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

// A tile is in reach if it's close to town OR adjacent to any worked tile.
// Recomputed fresh each time — the grid is small (300 tiles) so we stay simple.
export function isInReach(state: GameState, x: number, y: number): boolean {
  if (cheby(x, y, state.town.x, state.town.y) <= BASE_REACH) return true;
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const t = state.tiles[ty][tx];
      if (t.state !== "worked") continue;
      if (cheby(x, y, tx, ty) <= WORKED_REACH) return true;
    }
  }
  return false;
}

export function reachableTiles(state: GameState): Array<{ x: number; y: number; tile: Tile }> {
  const out: Array<{ x: number; y: number; tile: Tile }> = [];
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const tile = state.tiles[y][x];
      if (!tile.discovered) continue;
      if (!isInReach(state, x, y)) continue;
      out.push({ x, y, tile });
    }
  }
  return out;
}

// True if the tile can host another worker for this job right now.
function tileAcceptsWorker(tile: Tile, job: Exclude<Job, "scout">): boolean {
  if (!JOB_TERRAINS[job].includes(tile.terrain)) return false;
  if (tile.state === "exhausted") return false;
  if (job === "hunter" && tile.gameExhausted) return false;
  return tile.workers < tile.capacity;
}

// The "tile bonus" the allocator optimises for when picking a tile for a given
// job. Farmers care about grass fertility; fishers care about rich fishing
// waters. Woodcutter/hunter/quarryman don't have a bonus dimension — 0 for
// them, so distance (the tiebreaker) wins.
function tileBonusForJob(tile: Tile, job: Exclude<Job, "scout">): number {
  if (job === "farmer") return tile.fertility;
  if (job === "fisher") return tile.fishRichness;
  return 0;
}

// Best in-reach, discovered, eligible tile for this job. Tile bonus is primary
// (prefer fertile/rich tiles over baseline even if a step further), distance
// is the tiebreaker.
export function findEligibleTile(
  state: GameState,
  job: Exclude<Job, "scout">,
): { x: number; y: number; tile: Tile } | null {
  let best: { x: number; y: number; tile: Tile; dist: number; bonus: number } | null = null;
  for (const { x, y, tile } of reachableTiles(state)) {
    if (!tileAcceptsWorker(tile, job)) continue;
    const dist = cheby(x, y, state.town.x, state.town.y);
    const bonus = tileBonusForJob(tile, job);
    const better =
      best === null ||
      bonus > best.bonus ||
      (bonus === best.bonus && dist < best.dist);
    if (better) best = { x, y, tile, dist, bonus };
  }
  return best && { x: best.x, y: best.y, tile: best.tile };
}

// Total capacity reachable right now for a given job — the ceiling the allocator shows.
export function totalReachableCapacity(state: GameState, job: Exclude<Job, "scout">): number {
  const terrains = JOB_TERRAINS[job];
  let total = 0;
  for (const { tile } of reachableTiles(state)) {
    if (!terrains.includes(tile.terrain)) continue;
    if (tile.state === "exhausted") continue;
    if (job === "hunter" && tile.gameExhausted) continue;
    total += tile.capacity;
  }
  return total;
}

// Sum of workers for a given job. Forest tiles track hunters and woodcutters
// separately via hunterWorkers; all other terrain types have homogeneous workers.
export function currentWorkers(state: GameState, job: Exclude<Job, "scout">): number {
  const terrains = JOB_TERRAINS[job];
  let n = 0;
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = state.tiles[y][x];
      if (!terrains.includes(t.terrain)) continue;
      if (t.terrain === "forest") {
        n += job === "hunter" ? t.hunterWorkers : t.workers - t.hunterWorkers;
      } else {
        n += t.workers;
      }
    }
  }
  return n;
}

// Pick a tile to pull a worker off (for - button or famine deallocation).
// Prefers tiles furthest from town — preserves productive close-in work.
export function findWorkerToRemove(
  state: GameState,
  job: Exclude<Job, "scout">,
): { x: number; y: number } | null {
  const terrains = JOB_TERRAINS[job];
  let best: { x: number; y: number; dist: number } | null = null;
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = state.tiles[y][x];
      if (!terrains.includes(t.terrain)) continue;
      if (t.terrain === "forest") {
        if (job === "hunter" && t.hunterWorkers <= 0) continue;
        if (job === "woodcutter" && t.workers - t.hunterWorkers <= 0) continue;
      } else if (t.workers <= 0) {
        continue;
      }
      const dist = cheby(x, y, state.town.x, state.town.y);
      if (best === null || dist > best.dist) best = { x, y, dist };
    }
  }
  return best && { x: best.x, y: best.y };
}
