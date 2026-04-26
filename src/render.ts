import { GameState, MAP_H, MAP_W, Terrain, Tile, TILE_SIZE } from "./types";

const TERRAIN_COLORS: Record<Terrain, string> = {
  water: "#1a3a5c",
  beach: "#c9a870",
  river: "#2e6b88",
  grass: "#4a7c3a",
  forest: "#2a5a28",
  stone: "#8a7a6a",
  mountain: "#5a4a3a",
};

const FARMLAND_COLOR = "#7a5a2a";
const PASTURE_COLOR  = "#4a6830";   // shepherd grass — greener than turned farmland
const LOGGING_COLOR = "#3a3020";
const QUARRY_COLOR = "#5a5248";
const EXHAUSTED_FOREST = "#4a3820";
const EXHAUSTED_STONE = "#4a4238";

const FOG_COLOR = "#0a0d11";
const FOG_EDGE = "#1a1a20";

export function render(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.imageSmoothingEnabled = false;

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const tile = state.tiles[y][x];
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;
      if (!tile.discovered) {
        drawFog(ctx, px, py);
        continue;
      }
      drawTile(ctx, px, py, tile, x, y);
    }
  }

  drawTown(ctx, state.town.x * TILE_SIZE, state.town.y * TILE_SIZE);

  if (state.selectedTile) {
    drawSelection(ctx, state.selectedTile.x * TILE_SIZE, state.selectedTile.y * TILE_SIZE);
  }
}

function drawFog(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.fillStyle = FOG_COLOR;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = FOG_EDGE;
  ctx.fillRect(px, py, TILE_SIZE, 1);
  ctx.fillRect(px, py, 1, TILE_SIZE);
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tile: Tile,
  tx: number,
  ty: number,
): void {
  // Background layer: wild terrain OR worked surface.
  const bg = baseColor(tile);
  ctx.fillStyle = bg;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

  // Faint checker shading for a tiled feel.
  if ((tx + ty) % 2 === 0) {
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  }

  // Decoration layer: depends on terrain + state.
  if (tile.state === "worked" || tile.state === "fallow") {
    drawWorkedDecor(ctx, px, py, tile);
  } else if (tile.state === "exhausted") {
    drawExhaustedDecor(ctx, px, py, tile.terrain);
  } else {
    drawWildDecor(ctx, px, py, tile);
  }
  if (tile.terrain === "grass" && tile.fertility > 0 && tile.state !== "exhausted") {
    drawFertileMark(ctx, px, py);
  }
  if ((tile.terrain === "beach" || tile.terrain === "river") && tile.fishRichness > 0) {
    drawRichWaterMark(ctx, px, py);
  }

  if (tile.state === "cultivating") drawScaffolding(ctx, px, py);
  if (tile.state === "fallow") drawWeeds(ctx, px, py);
  if (tile.road) drawRoadOverlay(ctx, px, py);

  // Subtle right/bottom edge darkening.
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.fillRect(px + TILE_SIZE - 1, py, 1, TILE_SIZE);
  ctx.fillRect(px, py + TILE_SIZE - 1, TILE_SIZE, 1);
}

function baseColor(tile: Tile): string {
  if (tile.state === "worked" || tile.state === "fallow") {
    if (tile.terrain === "grass") return tile.shepherdWorkers > 0 ? PASTURE_COLOR : FARMLAND_COLOR;
    if (tile.terrain === "forest") return LOGGING_COLOR;
    if (tile.terrain === "stone") return QUARRY_COLOR;
  }
  if (tile.state === "exhausted") {
    if (tile.terrain === "forest") return EXHAUSTED_FOREST;
    if (tile.terrain === "stone") return EXHAUSTED_STONE;
  }
  return TERRAIN_COLORS[tile.terrain];
}

function drawWildDecor(ctx: CanvasRenderingContext2D, px: number, py: number, tile: Tile): void {
  switch (tile.terrain) {
    case "forest": drawTrees(ctx, px, py); break;
    case "stone": drawRocks(ctx, px, py); break;
    case "mountain": drawPeak(ctx, px, py); break;
    case "water": drawRipples(ctx, px, py); break;
    case "river": drawRiverFlow(ctx, px, py); break;
    case "beach": drawBeachDots(ctx, px, py); break;
  }
}

// Bright tufts on fertile grass — visible on both wild meadow and tended farm.
function drawFertileMark(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.fillStyle = "rgba(220,240,120,0.7)";
  ctx.fillRect(px + 4, py + 4, 2, 2);
  ctx.fillRect(px + 26, py + 6, 2, 2);
  ctx.fillRect(px + 10, py + 26, 2, 2);
  ctx.fillRect(px + 22, py + 24, 2, 2);
}

// Foam flecks on rich fishing waters — crab/tuna shoals churning the surface.
function drawRichWaterMark(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.fillStyle = "rgba(230,245,255,0.75)";
  ctx.fillRect(px + 6, py + 8, 2, 2);
  ctx.fillRect(px + 22, py + 12, 2, 2);
  ctx.fillRect(px + 14, py + 20, 2, 2);
  ctx.fillRect(px + 26, py + 24, 2, 2);
}

function drawWorkedDecor(ctx: CanvasRenderingContext2D, px: number, py: number, tile: Tile): void {
  switch (tile.terrain) {
    case "grass":
      if (tile.shepherdWorkers > 0) drawPastureDecor(ctx, px, py);
      else drawFarmRows(ctx, px, py);
      break;
    case "forest": drawLoggingCamp(ctx, px, py); break;
    case "stone": drawQuarryTerraces(ctx, px, py); break;
    case "beach": drawFishingBoat(ctx, px, py); break;
    case "river": drawRiverWeir(ctx, px, py); break;
  }
}

function drawExhaustedDecor(ctx: CanvasRenderingContext2D, px: number, py: number, terrain: Terrain): void {
  if (terrain === "forest") {
    // Scattered stumps.
    ctx.fillStyle = "#2a1f14";
    ctx.fillRect(px + 6, py + 10, 3, 3);
    ctx.fillRect(px + 18, py + 14, 3, 3);
    ctx.fillRect(px + 12, py + 22, 3, 3);
    ctx.fillRect(px + 24, py + 20, 3, 3);
  } else if (terrain === "stone") {
    // Dug-out pit with rubble.
    ctx.fillStyle = "#2e2820";
    ctx.fillRect(px + 6, py + 10, 20, 14);
    ctx.fillStyle = "#6a6254";
    ctx.fillRect(px + 8, py + 14, 3, 2);
    ctx.fillRect(px + 16, py + 18, 4, 2);
    ctx.fillRect(px + 22, py + 12, 2, 2);
  }
}

function drawFarmRows(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.fillStyle = "#5a3f1e";
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(px + 3, py + 5 + i * 7, TILE_SIZE - 6, 2);
  }
  ctx.fillStyle = "rgba(255,220,120,0.18)";
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(px + 3, py + 5 + i * 7, TILE_SIZE - 6, 1);
  }
}

function drawPastureDecor(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  // Low grass tufts suggesting a grazed meadow.
  ctx.fillStyle = "rgba(180,210,120,0.35)";
  for (let i = 0; i < 5; i++) {
    const gx = px + 4 + i * 6;
    ctx.fillRect(gx, py + 8,  1, 4);
    ctx.fillRect(gx + 1, py + 7, 1, 3);
    ctx.fillRect(gx, py + 20, 1, 4);
    ctx.fillRect(gx + 1, py + 21, 1, 3);
  }
  // Tiny white sheep blobs — two of them.
  ctx.fillStyle = "rgba(240,240,230,0.85)";
  ctx.fillRect(px + 7,  py + 13, 5, 3);
  ctx.fillRect(px + 6,  py + 14, 7, 2);
  ctx.fillRect(px + 20, py + 10, 5, 3);
  ctx.fillRect(px + 19, py + 11, 7, 2);
  // Tiny dark heads.
  ctx.fillStyle = "rgba(60,40,20,0.8)";
  ctx.fillRect(px + 12, py + 13, 2, 2);
  ctx.fillRect(px + 25, py + 10, 2, 2);
}

function drawLoggingCamp(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  // A few remaining trees + stumps + small cabin.
  ctx.fillStyle = "#12341a";
  drawPixelBlob(ctx, px + 22, py + 8, 4);
  ctx.fillStyle = "#1f4f28";
  drawPixelBlob(ctx, px + 22, py + 7, 2);

  // Stumps
  ctx.fillStyle = "#3a2516";
  ctx.fillRect(px + 8, py + 14, 3, 2);
  ctx.fillRect(px + 14, py + 22, 3, 2);

  // Cabin
  ctx.fillStyle = "#6a4a28";
  ctx.fillRect(px + 4, py + 20, 8, 6);
  ctx.fillStyle = "#8a5a30";
  for (let i = 0; i < 5; i++) ctx.fillRect(px + 3 + i, py + 20 - i, 10 - 2 * i, 1);
  ctx.fillStyle = "#2a1a0c";
  ctx.fillRect(px + 7, py + 23, 2, 3);
}

function drawQuarryTerraces(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  // Stepped shading — darker as it goes down.
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.fillRect(px + 4, py + 8, TILE_SIZE - 8, 18);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(px + 7, py + 12, TILE_SIZE - 14, 12);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(px + 10, py + 16, TILE_SIZE - 20, 6);
  // Tiny rubble bits for texture.
  ctx.fillStyle = "#a59988";
  ctx.fillRect(px + 5, py + 10, 1, 1);
  ctx.fillRect(px + 25, py + 22, 1, 1);
  ctx.fillRect(px + 16, py + 14, 1, 1);
}

function drawScaffolding(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.strokeStyle = "rgba(240,220,160,0.6)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  // Diagonal hatching.
  for (let i = -TILE_SIZE; i < TILE_SIZE; i += 6) {
    ctx.moveTo(px + i, py);
    ctx.lineTo(px + i + TILE_SIZE, py + TILE_SIZE);
  }
  ctx.stroke();
  ctx.lineWidth = 1;
}

function drawWeeds(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.fillStyle = "rgba(90,130,50,0.55)";
  ctx.fillRect(px + 5, py + 6, 1, 3);
  ctx.fillRect(px + 13, py + 10, 1, 3);
  ctx.fillRect(px + 22, py + 5, 1, 3);
  ctx.fillRect(px + 9, py + 18, 1, 3);
  ctx.fillRect(px + 25, py + 22, 1, 3);
  ctx.fillRect(px + 17, py + 25, 1, 3);
}

function drawTrees(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.fillStyle = "#12341a";
  drawPixelBlob(ctx, px + 6, py + 10, 6);
  drawPixelBlob(ctx, px + 20, py + 6, 5);
  drawPixelBlob(ctx, px + 14, py + 22, 6);
  ctx.fillStyle = "#1f4f28";
  drawPixelBlob(ctx, px + 7, py + 9, 3);
  drawPixelBlob(ctx, px + 21, py + 5, 2);
  drawPixelBlob(ctx, px + 15, py + 21, 3);
}

function drawRocks(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.fillStyle = "#5c5046";
  ctx.fillRect(px + 6, py + 14, 8, 6);
  ctx.fillRect(px + 18, py + 8, 7, 6);
  ctx.fillRect(px + 12, py + 22, 6, 5);
  ctx.fillStyle = "#a59988";
  ctx.fillRect(px + 7, py + 14, 6, 1);
  ctx.fillRect(px + 19, py + 8, 5, 1);
  ctx.fillRect(px + 13, py + 22, 4, 1);
}

function drawPeak(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.fillStyle = "#3a2d20";
  for (let i = 0; i < 14; i++) {
    ctx.fillRect(px + 16 - i, py + 20 - i, 2 * i, 2);
  }
  ctx.fillStyle = "#efe9d8";
  ctx.fillRect(px + 14, py + 8, 4, 2);
  ctx.fillRect(px + 13, py + 10, 6, 1);
}

function drawRipples(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.fillStyle = "rgba(200,230,255,0.12)";
  ctx.fillRect(px + 4, py + 10, 6, 1);
  ctx.fillRect(px + 18, py + 18, 8, 1);
  ctx.fillRect(px + 10, py + 24, 5, 1);
}

function drawRiverFlow(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.fillStyle = "rgba(200,230,255,0.22)";
  ctx.fillRect(px + 6, py + 8, 10, 1);
  ctx.fillRect(px + 14, py + 16, 12, 1);
  ctx.fillRect(px + 4, py + 24, 8, 1);
  ctx.fillStyle = "rgba(60,130,170,0.5)";
  ctx.fillRect(px + 20, py + 10, 3, 1);
  ctx.fillRect(px + 10, py + 20, 3, 1);
}

function drawFishingBoat(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  // Small hull on the water's edge + a stick mast.
  ctx.fillStyle = "#5a3820";
  ctx.fillRect(px + 10, py + 16, 12, 3);
  ctx.fillRect(px + 12, py + 19, 8, 1);
  ctx.fillStyle = "#8a5a30";
  ctx.fillRect(px + 15, py + 7, 1, 9);
  ctx.fillStyle = "rgba(240,230,200,0.85)";
  ctx.fillRect(px + 16, py + 8, 5, 6);
  // Small net ripple nearby
  ctx.fillStyle = "rgba(230,245,255,0.4)";
  ctx.fillRect(px + 4, py + 22, 5, 1);
  ctx.fillRect(px + 22, py + 24, 6, 1);
}

function drawRiverWeir(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  // A staked fish weir across the current — dark posts with a central mesh.
  ctx.fillStyle = "#3a2516";
  for (let i = 0; i < 5; i++) ctx.fillRect(px + 6 + i * 5, py + 8, 1, 16);
  ctx.fillStyle = "rgba(60,45,30,0.5)";
  ctx.fillRect(px + 6, py + 14, 22, 1);
  ctx.fillRect(px + 6, py + 18, 22, 1);
  // A lone basket / trap bulge
  ctx.fillStyle = "#6a4a28";
  ctx.fillRect(px + 13, py + 21, 5, 3);
}

function drawBeachDots(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(px + 8, py + 10, 1, 1);
  ctx.fillRect(px + 20, py + 14, 1, 1);
  ctx.fillRect(px + 14, py + 22, 1, 1);
  ctx.fillRect(px + 24, py + 6, 1, 1);
}

function drawPixelBlob(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.fillRect(cx - r + 1, cy - r, 2 * r - 2, 1);
  ctx.fillRect(cx - r, cy - r + 1, 2 * r, 2 * r - 2);
  ctx.fillRect(cx - r + 1, cy + r - 1, 2 * r - 2, 1);
}

function drawTown(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.fillStyle = "#8b5a2b";
  ctx.fillRect(px + 8, py + 14, 16, 12);
  ctx.fillStyle = "#c75a4a";
  for (let i = 0; i < 9; i++) {
    ctx.fillRect(px + 7 + i, py + 14 - i, 18 - 2 * i, 1);
  }
  ctx.fillStyle = "#3a2516";
  ctx.fillRect(px + 14, py + 20, 4, 6);
  ctx.fillStyle = "#f4e4a4";
  ctx.fillRect(px + 10, py + 17, 2, 2);
  ctx.fillRect(px + 20, py + 17, 2, 2);
  ctx.fillStyle = "#d4a94a";
  ctx.fillRect(px + 15, py + 4, 1, 10);
  ctx.fillRect(px + 15, py + 4, 5, 3);
}

function drawRoadOverlay(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  const mid = TILE_SIZE / 2;
  // Packed-earth path: a horizontal and vertical band through the tile centre.
  ctx.fillStyle = "rgba(180,150,100,0.55)";
  ctx.fillRect(px, py + mid - 3, TILE_SIZE, 6);
  ctx.fillRect(px + mid - 3, py, 6, TILE_SIZE);
  // Worn centre stone.
  ctx.fillStyle = "rgba(210,185,140,0.7)";
  ctx.fillRect(px + mid - 2, py + mid - 2, 4, 4);
}

function drawSelection(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.strokeStyle = "#f4d878";
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  ctx.lineWidth = 1;
}
