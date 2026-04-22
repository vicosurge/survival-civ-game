import { findEligibleTile, findWorkerToRemove, isInReach, totalReachableCapacity } from "./map";
import { adultCount, childCount, idleCount, jobCount, projectedYields, totalPop } from "./state";
import {
  assignWorker,
  build,
  buildRoad,
  canBuild,
  canBuildRoad,
  canDispatchBoat,
  canExecuteTrade,
  declineTrade,
  dispatchBoat,
  executeTrade,
  unassignWorker,
} from "./turn";
import {
  BOAT_CREW_SIZE,
  BUILDINGS,
  BuildingDef,
  BuildingId,
  GameState,
  Job,
  JOBS,
  JOB_LABEL,
  MAP_H,
  MAP_W,
  Tile,
  TILE_SIZE,
  LONG_HOUSE_POP_GATE,
  ROAD_COST,
  TRADE_MAX_PER_VISIT,
  TRADE_RATES,
  TradeAction,
  TradeResource,
} from "./types";

export interface UIHandlers {
  onEndYear: () => void;
  onNewGame: () => void;
}

const SKIP_INTRO_KEY = "isle-of-cambrera-skip-intro";

export function initUI(handlers: UIHandlers): void {
  document.getElementById("end-turn-btn")!.addEventListener("click", handlers.onEndYear);
  document.getElementById("new-game-btn")!.addEventListener("click", () => {
    if (confirm("Abandon this settlement and start a new game?")) handlers.onNewGame();
  });
  initIntroHandlers();
}

function initIntroHandlers(): void {
  const beginBtn = document.getElementById("intro-begin-btn")!;
  const skipBox = document.getElementById("intro-skip-checkbox") as HTMLInputElement;
  skipBox.checked = localStorage.getItem(SKIP_INTRO_KEY) === "1";
  skipBox.addEventListener("change", () => {
    if (skipBox.checked) localStorage.setItem(SKIP_INTRO_KEY, "1");
    else localStorage.removeItem(SKIP_INTRO_KEY);
  });
  beginBtn.addEventListener("click", () => hideIntro());
}

export function maybeShowIntro(): void {
  if (localStorage.getItem(SKIP_INTRO_KEY) === "1") return;
  const overlay = document.getElementById("intro-overlay")!;
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
}

function hideIntro(): void {
  const overlay = document.getElementById("intro-overlay")!;
  overlay.classList.add("hidden");
  overlay.setAttribute("aria-hidden", "true");
}

export function attachCanvasClick(
  canvas: HTMLCanvasElement,
  state: () => GameState,
  onChange: () => void,
): void {
  canvas.addEventListener("click", (ev) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const tx = Math.floor(((ev.clientX - rect.left) * scaleX) / TILE_SIZE);
    const ty = Math.floor(((ev.clientY - rect.top) * scaleY) / TILE_SIZE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return;
    const s = state();
    if (!s.tiles[ty][tx].discovered) return;
    s.selectedTile =
      s.selectedTile && s.selectedTile.x === tx && s.selectedTile.y === ty ? null : { x: tx, y: ty };
    onChange();
  });
}

export function renderUI(state: GameState, onAllocChange: () => void): void {
  renderTopbar(state);
  renderAllocation(state, onAllocChange);
  renderBuildingsPanel(state, onAllocChange);
  renderShipPanel(state, onAllocChange);
  renderTileInfo(state, onAllocChange);
  renderLog(state);
  const endBtn = document.getElementById("end-turn-btn") as HTMLButtonElement;
  endBtn.disabled = state.gameOver || state.pendingMerchant;
  endBtn.textContent = state.gameOver
    ? "— Settlement Failed —"
    : state.pendingMerchant
      ? "Merchants waiting…"
      : "End Year";
}

export function maybeShowTradeModal(state: GameState, onResolve: () => void): void {
  if (!state.pendingMerchant || state.gameOver) {
    hideTradeModal();
    return;
  }
  showTradeModal(state, onResolve);
}

function hideTradeModal(): void {
  const overlay = document.getElementById("trade-overlay")!;
  overlay.classList.add("hidden");
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = "";
}

function showTradeModal(state: GameState, onResolve: () => void): void {
  const overlay = document.getElementById("trade-overlay")!;
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");

  let action: TradeAction = "sell";
  let resource: TradeResource = "food";
  let qty = 1;

  const rerender = (): void => {
    overlay.innerHTML = buildTradeHTML(state, action, resource, qty);
    bind();
  };

  const bind = (): void => {
    overlay.querySelectorAll<HTMLLabelElement>(".trade-opt").forEach((label) => {
      label.addEventListener("click", () => {
        const a = label.dataset.action as TradeAction;
        const r = label.dataset.resource as TradeResource;
        action = a;
        resource = r;
        rerender();
      });
    });
    overlay.querySelector<HTMLButtonElement>(".qty-minus")!
      .addEventListener("click", () => { if (qty > 1) { qty -= 1; rerender(); } });
    overlay.querySelector<HTMLButtonElement>(".qty-plus")!
      .addEventListener("click", () => { if (qty < TRADE_MAX_PER_VISIT) { qty += 1; rerender(); } });
    overlay.querySelector<HTMLButtonElement>(".trade-confirm")!.addEventListener("click", () => {
      if (!canExecuteTrade(state, action, resource, qty)) return;
      state.log.unshift(executeTrade(state, action, resource, qty));
      hideTradeModal();
      onResolve();
    });
    overlay.querySelector<HTMLButtonElement>(".trade-decline")!.addEventListener("click", () => {
      state.log.unshift(declineTrade(state));
      hideTradeModal();
      onResolve();
    });
  };

  rerender();
}

function buildTradeHTML(state: GameState, action: TradeAction, resource: TradeResource, qty: number): string {
  const rate = TRADE_RATES[action][resource];
  const goldDelta = qty * rate;
  const valid = canExecuteTrade(state, action, resource, qty);
  const previewClass = valid ? "trade-preview" : "trade-preview invalid";
  const preview = action === "sell"
    ? `You give <strong>${qty} ${resource}</strong>, receive <strong>${goldDelta} gold</strong>.`
    : `You spend <strong>${goldDelta} gold</strong>, receive <strong>${qty} ${resource}</strong>.`;
  const invalidNote = !valid
    ? action === "sell"
      ? ` <em>(not enough ${resource})</em>`
      : ` <em>(not enough gold)</em>`
    : "";

  const opt = (a: TradeAction, r: TradeResource): string => {
    const selected = a === action && r === resource ? " selected" : "";
    const verb = a === "sell" ? "Sell" : "Buy";
    const resLabel = r.charAt(0).toUpperCase() + r.slice(1);
    const price = TRADE_RATES[a][r];
    return `<label class="trade-opt${selected}" data-action="${a}" data-resource="${r}">
      <input type="radio" name="trade" ${selected ? "checked" : ""} />
      ${verb} ${resLabel} <span style="color:#6b3f0f;font-size:0.8rem;">(${price}g)</span>
    </label>`;
  };

  return `
    <div id="trade-panel" role="dialog" aria-label="Merchant trade">
      <h2>✦ Travelling Merchants ✦</h2>
      <p class="trade-flavor">They've laid out their wares at the edge of the clearing. One trade is on offer before they move on.</p>
      <div class="trade-onhand">
        On hand: <strong>${state.gold}</strong> gold, <strong>${state.food}</strong> food, <strong>${state.wood}</strong> wood, <strong>${state.stone}</strong> stone
      </div>
      <div class="trade-options">
        ${opt("sell", "food")}
        ${opt("buy", "food")}
        ${opt("sell", "wood")}
        ${opt("buy", "wood")}
        ${opt("sell", "stone")}
        ${opt("buy", "stone")}
      </div>
      <div class="trade-qty">
        <button class="qty-minus" ${qty <= 1 ? "disabled" : ""}>−</button>
        <span class="qty-value">${qty}</span>
        <button class="qty-plus" ${qty >= TRADE_MAX_PER_VISIT ? "disabled" : ""}>+</button>
        <span style="color:#6b3f0f;font-size:0.8rem;margin-left:0.5rem;">(max ${TRADE_MAX_PER_VISIT})</span>
      </div>
      <div class="${previewClass}">${preview}${invalidNote}</div>
      <div class="trade-buttons">
        <button class="trade-confirm" ${valid ? "" : "disabled"}>Trade</button>
        <button class="trade-decline">Decline</button>
      </div>
    </div>
  `;
}

function renderTopbar(state: GameState): void {
  document.getElementById("year-display")!.textContent = `Year ${state.year}`;
  const el = document.getElementById("resources")!;
  el.innerHTML = "";
  const pop = totalPop(state);
  const kids = childCount(state);
  const adults = adultCount(state);
  const yields = projectedYields(state);
  el.append(
    resChip("Pop", `${pop} (${adults}A+${kids}C)`),
    resChip("Food", state.food, netDelta(yields.food.net)),
    resChip("Wood", state.wood, productionDelta(yields.wood)),
    resChip("Stone", state.stone, productionDelta(yields.stone)),
    resChip("Gold", state.gold),
    moraleChip(state.morale),
  );
}

function moraleChip(morale: number): HTMLElement {
  const tone = morale >= 70 ? "good" : morale >= 40 ? "mid" : "bad";
  const span = document.createElement("span");
  span.className = `res mood mood-${tone}`;
  span.title =
    morale >= 70 ? "High spirits — settlement thrives."
    : morale >= 40 ? "Mood is uneasy — watch food and safety."
    : "Morale is low — growth has stalled.";
  span.innerHTML = `<span class="label">Mood</span><span class="value">${morale}</span>`;
  return span;
}

function netDelta(net: number): { text: string; tone: "pos" | "neg" | "neutral" } {
  const text = net >= 0 ? `+${net}/yr` : `${net}/yr`;
  const tone = net > 0 ? "pos" : net < 0 ? "neg" : "neutral";
  return { text, tone };
}

function productionDelta(production: number): { text: string; tone: "pos" | "neg" | "neutral" } {
  const text = `+${production}/yr`;
  const tone = production > 0 ? "pos" : "neutral";
  return { text, tone };
}

function resChip(label: string, value: number | string, delta?: { text: string; tone: "pos" | "neg" | "neutral" }): HTMLElement {
  const span = document.createElement("span");
  span.className = "res";
  const deltaHtml = delta ? `<span class="delta ${delta.tone}">${delta.text}</span>` : "";
  span.innerHTML = `<span class="label">${label}</span><span class="value">${value}</span>${deltaHtml}`;
  return span;
}

function renderAllocation(state: GameState, onChange: () => void): void {
  const summary = document.getElementById("villager-summary")!;
  const idle = idleCount(state);
  const adults = adultCount(state);
  const kids = childCount(state);
  const kidSuffix = kids > 0 ? `, ${kids} child${kids === 1 ? "" : "ren"}` : "";
  summary.textContent = `${adults} adult${adults === 1 ? "" : "s"}${kidSuffix} — ${idle} idle`;

  const container = document.getElementById("job-controls")!;
  container.innerHTML = "";
  for (const job of JOBS) {
    container.appendChild(jobRow(state, job, onChange));
  }
}

function jobRow(state: GameState, job: Job, onChange: () => void): HTMLElement {
  const row = document.createElement("div");
  row.className = "job-row";

  const count = jobCount(state, job);
  const cap = job === "scout" ? adultCount(state) : totalReachableCapacity(state, job);
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = `${JOB_LABEL[job]} ${count}/${cap}`;

  const minus = document.createElement("button");
  minus.textContent = "−";
  minus.disabled = state.gameOver || count <= 0;
  minus.addEventListener("click", () => {
    if (job === "scout") {
      if (state.scouts > 0) state.scouts -= 1;
    } else {
      const slot = findWorkerToRemove(state, job);
      if (slot) unassignWorker(state, slot.x, slot.y, job);
    }
    onChange();
  });

  const countEl = document.createElement("span");
  countEl.className = "count";
  countEl.textContent = String(count);

  const plus = document.createElement("button");
  plus.textContent = "+";
  const canAddScout = job === "scout" && idleCount(state) > 0;
  let canAddProd = false;
  if (job !== "scout") {
    canAddProd = idleCount(state) > 0 && findEligibleTile(state, job) !== null;
  }
  plus.disabled = state.gameOver || !(canAddScout || canAddProd);
  if (job !== "scout" && idleCount(state) > 0 && !canAddProd) {
    const terrainLabel: Record<Exclude<Job, "scout">, string> = {
      farmer: "grassland", woodcutter: "forest", hunter: "forest", quarryman: "stone",
      fisher: "shallows",
    };
    plus.title = `No ${terrainLabel[job]} in reach — send scouts`;
  }
  plus.addEventListener("click", () => {
    if (job === "scout") {
      if (idleCount(state) > 0) state.scouts += 1;
    } else {
      const slot = findEligibleTile(state, job);
      if (slot) assignWorker(state, slot.x, slot.y, job);
    }
    onChange();
  });

  row.append(name, minus, countEl, plus);
  return row;
}

function renderBuildingsPanel(state: GameState, onChange: () => void): void {
  const panel = document.getElementById("buildings-panel")!;
  panel.innerHTML = "";
  const ids = Object.keys(BUILDINGS) as BuildingId[];
  for (const id of ids) {
    panel.appendChild(buildingRow(state, BUILDINGS[id], onChange));
  }
}

function buildingRow(state: GameState, def: BuildingDef, onChange: () => void): HTMLElement {
  const row = document.createElement("div");
  row.className = "building-row";
  row.title = def.description;
  const built = state.buildings[def.id];

  if (built) {
    row.classList.add("built");
    const name = document.createElement("span");
    name.className = "building-name";
    name.textContent = `✓ ${def.name}`;
    row.append(name);
    return row;
  }

  const name = document.createElement("span");
  name.className = "building-name";
  name.textContent = def.name;

  const cost = document.createElement("span");
  cost.className = "building-cost";
  cost.append(...costChips(state, def));

  const btn = document.createElement("button");
  btn.textContent = "Build";
  btn.disabled = !canBuild(state, def.id);
  if (def.id === "long_house" && state.pops.length < LONG_HOUSE_POP_GATE) {
    btn.title = `Requires ${LONG_HOUSE_POP_GATE} people (${state.pops.length} now)`;
  }
  btn.addEventListener("click", () => {
    build(state, def.id);
    onChange();
  });

  row.append(name, cost, btn);
  return row;
}

function costChips(state: GameState, def: BuildingDef): HTMLElement[] {
  const chips: HTMLElement[] = [];
  const entries: Array<["food" | "wood" | "stone" | "gold", string]> = [
    ["food", "f"],
    ["wood", "w"],
    ["stone", "s"],
    ["gold", "g"],
  ];
  for (const [key, label] of entries) {
    const amount = def.cost[key];
    if (!amount) continue;
    const have = state[key];
    const chip = document.createElement("span");
    chip.className = `cost-chip ${have >= amount ? "ok" : "short"}`;
    chip.textContent = `${amount}${label}`;
    chips.push(chip);
  }
  return chips;
}

function renderShipPanel(state: GameState, onChange: () => void): void {
  const panel = document.getElementById("ship-panel")!;
  panel.innerHTML = "";

  const status = document.createElement("div");
  status.className = "ship-status";
  if (state.boat.status === "docked") {
    status.innerHTML = `<strong>Docked at Cambrera.</strong> Idle adults can crew a voyage to seek survivors.`;
  } else {
    const yearsLeft = state.boat.returnYear !== null ? Math.max(0, state.boat.returnYear - state.year) : 0;
    const crewCount = state.boat.crew.length;
    status.innerHTML = `<strong>At sea.</strong> ${crewCount} crew aboard; returns in ${yearsLeft} year${yearsLeft === 1 ? "" : "s"}.`;
  }
  panel.appendChild(status);

  const btn = document.createElement("button");
  if (state.boat.status === "voyage") {
    btn.textContent = "Ship at sea";
    btn.disabled = true;
  } else {
    btn.textContent = `Dispatch (− ${BOAT_CREW_SIZE} adults)`;
    btn.disabled = !canDispatchBoat(state);
  }
  btn.addEventListener("click", () => {
    dispatchBoat(state);
    onChange();
  });
  panel.appendChild(btn);
}

function renderTileInfo(state: GameState, onChange: () => void): void {
  const panel = document.getElementById("tile-info")!;
  if (!state.selectedTile) {
    panel.innerHTML = `<div class="hint">Click a tile to inspect it.</div>`;
    return;
  }
  const { x, y } = state.selectedTile;
  const t = state.tiles[y][x];
  panel.innerHTML = describeTile(t, x, y);

  if (t.discovered && !t.road && t.terrain !== "water" && t.terrain !== "mountain") {
    const btn = document.createElement("button");
    const inReach = isInReach(state, x, y);
    const canRoad = canBuildRoad(state, x, y);
    btn.textContent = `Build Road (${ROAD_COST.wood}w ${ROAD_COST.stone}s)`;
    btn.disabled = !canRoad;
    if (!state.buildings.long_house) {
      btn.title = "Requires Long House";
    } else if (!inReach) {
      btn.title = "Tile not in reach — build roads outward from existing territory";
    } else if (state.wood < ROAD_COST.wood || state.stone < ROAD_COST.stone) {
      btn.title = "Not enough resources";
    }
    btn.addEventListener("click", () => {
      buildRoad(state, x, y);
      onChange();
    });
    panel.appendChild(btn);
  }
}

function describeTile(t: Tile, x: number, y: number): string {
  const lines: string[] = [];
  lines.push(`<div class="tile-title">${terrainLabel(t)} <span class="coord">(${x},${y})</span></div>`);
  lines.push(`<div class="tile-state">${stateLabel(t)}</div>`);
  if (t.terrain === "forest" && t.capacity > 0) {
    const woodcutters = t.workers - t.hunterWorkers;
    const parts: string[] = [];
    if (t.hunterWorkers > 0) parts.push(`${t.hunterWorkers} hunter${t.hunterWorkers > 1 ? "s" : ""}`);
    if (woodcutters > 0) parts.push(`${woodcutters} woodcutter${woodcutters > 1 ? "s" : ""}`);
    const detail = parts.length > 0 ? ` (${parts.join(", ")})` : "";
    lines.push(`<div>Workers: ${t.workers}/${t.capacity}${detail}</div>`);
  } else if (t.capacity > 0) {
    lines.push(`<div>Workers: ${t.workers}/${t.capacity}</div>`);
  }
  if (t.terrain === "grass" && t.fertility > 0) {
    lines.push(`<div class="fertile">Fertile soil — +${t.fertility} food per farmer</div>`);
  }
  if ((t.terrain === "beach" || t.terrain === "river") && t.fishRichness > 0) {
    lines.push(`<div class="fertile">Rich waters — crab, tuna, shoals</div>`);
  }
  if (t.terrain === "forest") {
    if (t.gameExhausted) {
      lines.push(`<div class="muted">Game: exhausted — no more hunters; woodcutters may remain</div>`);
    } else if (t.state !== "wild") {
      lines.push(`<div>Game reserve: ${t.reserve}</div>`);
    } else {
      lines.push(`<div class="muted">Game reserve: unknown</div>`);
    }
  }
  if (t.terrain === "stone") {
    if (t.state === "exhausted") {
      lines.push(`<div class="muted">Reserve: exhausted</div>`);
    } else if (t.state === "worked") {
      lines.push(`<div>Reserve: ${t.reserve}</div>`);
    } else {
      lines.push(`<div class="muted">Reserve: unknown</div>`);
    }
  }
  return lines.join("");
}

function terrainLabel(t: Tile): string {
  if (t.state === "worked" || t.state === "fallow") {
    if (t.terrain === "grass") return t.state === "worked" ? "Farmland" : "Fallow Farmland";
    if (t.terrain === "forest") {
      const hasHunters = t.hunterWorkers > 0;
      const hasWoodcutters = t.workers - t.hunterWorkers > 0;
      if (t.state === "worked") {
        if (hasHunters && hasWoodcutters) return "Forest Camp";
        if (hasHunters) return "Hunting Camp";
        return "Logging Camp";
      }
      return "Abandoned Camp";
    }
    if (t.terrain === "stone") return t.state === "worked" ? "Quarry" : "Idle Quarry";
    if (t.terrain === "beach") return t.state === "worked" ? "Fishing Beach" : "Beach";
    if (t.terrain === "river") return t.state === "worked" ? "River Weir" : "River";
  }
  if (t.state === "exhausted") {
    if (t.terrain === "forest") return "Clear-cut Forest";
    if (t.terrain === "stone") return "Exhausted Quarry";
  }
  switch (t.terrain) {
    case "grass": return "Grassland";
    case "forest": return "Forest";
    case "stone": return "Rocky Outcrop";
    case "mountain": return "Mountain";
    case "beach": return "Beach";
    case "river": return "River";
    case "water": return "Sea";
  }
}

function stateLabel(t: Tile): string {
  if (t.state === "cultivating") return `Under cultivation (year ${t.yearsInState + 1} of 1)`;
  if (t.state === "fallow") return `Fallow — reverts in ${2 - t.yearsInState} year${2 - t.yearsInState === 1 ? "" : "s"}`;
  if (t.state === "exhausted") return `Exhausted`;
  if (t.state === "worked") return `Worked`;
  return `Wild`;
}

function renderLog(state: GameState): void {
  const log = document.getElementById("log")!;
  log.innerHTML = "";
  for (const entry of state.log) {
    const div = document.createElement("div");
    div.className = `log-entry ${entry.tone}`;
    div.innerHTML = `<span class="year">Y${entry.year}</span> — ${escapeHTML(entry.text)}`;
    log.appendChild(div);
  }
}

function escapeHTML(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
