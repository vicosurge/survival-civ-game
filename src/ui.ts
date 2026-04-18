import { findEligibleTile, findWorkerToRemove, totalReachableCapacity } from "./map";
import { adultCount, childCount, idleCount, jobCount, projectedYields, totalPop } from "./state";
import { assignWorker, canDispatchBoat, dispatchBoat, unassignWorker } from "./turn";
import { BOAT_CREW_SIZE, GameState, Job, JOBS, JOB_LABEL, MAP_H, MAP_W, Tile, TILE_SIZE } from "./types";

export interface UIHandlers {
  onEndYear: () => void;
  onNewGame: () => void;
}

const SKIP_INTRO_KEY = "isle-of-elden-skip-intro";

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
  renderShipPanel(state, onAllocChange);
  renderTileInfo(state);
  renderLog(state);
  const endBtn = document.getElementById("end-turn-btn") as HTMLButtonElement;
  endBtn.disabled = state.gameOver;
  endBtn.textContent = state.gameOver ? "— Settlement Failed —" : "End Year";
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
  );
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
      if (slot) unassignWorker(state, slot.x, slot.y);
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
    plus.title = `No ${job === "farmer" ? "grassland" : job === "woodcutter" ? "forest" : "stone"} in reach — send scouts`;
  }
  plus.addEventListener("click", () => {
    if (job === "scout") {
      if (idleCount(state) > 0) state.scouts += 1;
    } else {
      const slot = findEligibleTile(state, job);
      if (slot) assignWorker(state, slot.x, slot.y);
    }
    onChange();
  });

  row.append(name, minus, countEl, plus);
  return row;
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

function renderTileInfo(state: GameState): void {
  const panel = document.getElementById("tile-info")!;
  if (!state.selectedTile) {
    panel.innerHTML = `<div class="hint">Click a tile to inspect it.</div>`;
    return;
  }
  const { x, y } = state.selectedTile;
  const t = state.tiles[y][x];
  panel.innerHTML = describeTile(t, x, y);
}

function describeTile(t: Tile, x: number, y: number): string {
  const lines: string[] = [];
  lines.push(`<div class="tile-title">${terrainLabel(t)} <span class="coord">(${x},${y})</span></div>`);
  lines.push(`<div class="tile-state">${stateLabel(t)}</div>`);
  if (t.capacity > 0) {
    lines.push(`<div>Workers: ${t.workers}/${t.capacity}</div>`);
  }
  if (t.terrain === "grass" && t.fertility > 0) {
    lines.push(`<div class="fertile">Fertile soil — +${t.fertility} food per farmer</div>`);
  }
  if (t.terrain === "forest" || t.terrain === "stone") {
    if (t.state === "exhausted") {
      lines.push(`<div class="muted">Reserve: exhausted</div>`);
    } else if (t.state === "worked") {
      lines.push(`<div>Reserve: ${t.reserve} (known — depletes as worked)</div>`);
    } else {
      lines.push(`<div class="muted">Reserve: unknown</div>`);
    }
  }
  return lines.join("");
}

function terrainLabel(t: Tile): string {
  if (t.state === "worked" || t.state === "fallow") {
    if (t.terrain === "grass") return t.state === "worked" ? "Farmland" : "Fallow Farmland";
    if (t.terrain === "forest") return t.state === "worked" ? "Logging Camp" : "Abandoned Camp";
    if (t.terrain === "stone") return t.state === "worked" ? "Quarry" : "Idle Quarry";
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
