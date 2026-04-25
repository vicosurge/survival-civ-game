import { findEligibleTile, findWorkerToRemove, hasUndiscoveredFrontier, isInReach, totalReachableCapacity } from "./map";
import { JOB_TOOLTIPS } from "./narratives";
import { childCount, elderCount, fertileCount, idleCount, jobCount, popCapacity, projectedYields, totalPop } from "./state";
import {
  assignWorker,
  build,
  buildBlockerReason,
  buildHouse,
  buildRoad,
  canBuildRoad,
  canDispatchBoat,
  canExecuteTradeBasket,
  declineTrade,
  dispatchBoat,
  effectiveCrewLossChance,
  executeTradeBasket,
  fishingLossReduction,
  houseBlockerReason,
  unassignWorker,
} from "./turn";
import {
  ALARM_RESPONSES,
  AlarmResponseId,
  AUTHOR,
  BOAT_CREW_SIZE,
  BUILDINGS,
  BuildingDef,
  BuildingId,
  COMPANIONS,
  CompanionId,
  DEPARTURE_TIMINGS,
  DepartureChoices,
  DepartureTimingId,
  GameState,
  HOUSE_CAPACITY,
  HOUSE_COST,
  HOUSE_FOOD_YIELD,
  Job,
  JOBS,
  JOB_LABEL,
  LANDING_SPOTS,
  LandingSpotId,
  MAP_H,
  MAP_W,
  ORIGINS,
  OriginId,
  ROAD_COST,
  SHIP_FATES,
  ShipFateId,
  Tile,
  TILE_SIZE,
  TRADE_MAX_PER_VISIT,
  TRADE_RATES,
  TradeBasket,
  TradeResource,
  VERSION,
  basketGoldDelta,
  basketTotal,
  emptyBasket,
} from "./types";

export interface UIHandlers {
  onEndYear: () => void;
  onNewGame: () => void;
}

const SKIP_INTRO_KEY = "isle-of-cambrera-skip-intro";

// Callback dispatched when the player clicks Begin in the intro overlay.
// Updated each time maybeShowIntro is called so the handler is always current.
let _onIntroBegin: () => void = () => {};

export function initUI(handlers: UIHandlers): void {
  document.getElementById("end-turn-btn")!.addEventListener("click", handlers.onEndYear);
  document.getElementById("new-game-btn")!.addEventListener("click", () => {
    if (confirm("Abandon this settlement and start a new game?")) handlers.onNewGame();
  });
  renderStaticCredits();
  initIntroHandlers();
}

function renderStaticCredits(): void {
  document.getElementById("version-chip")!.textContent = VERSION;
  document.getElementById("author-chip")!.textContent = `by ${AUTHOR}`;
  document.getElementById("intro-author")!.textContent = AUTHOR;
  document.getElementById("intro-version")!.textContent = `Version ${VERSION}`;
  document.title = `Isle of Cambrera ${VERSION} — A Settler's Chronicle`;
}

function initIntroHandlers(): void {
  const beginBtn = document.getElementById("intro-begin-btn")!;
  const skipBox = document.getElementById("intro-skip-checkbox") as HTMLInputElement;
  skipBox.checked = localStorage.getItem(SKIP_INTRO_KEY) === "1";
  skipBox.addEventListener("change", () => {
    if (skipBox.checked) localStorage.setItem(SKIP_INTRO_KEY, "1");
    else localStorage.removeItem(SKIP_INTRO_KEY);
  });
  beginBtn.addEventListener("click", () => {
    hideIntro();
    _onIntroBegin();
  });
}

export function maybeShowIntro(onBegin: () => void): void {
  _onIntroBegin = onBegin;
  if (localStorage.getItem(SKIP_INTRO_KEY) === "1") {
    onBegin();
    return;
  }
  const overlay = document.getElementById("intro-overlay")!;
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
}

function hideIntro(): void {
  const overlay = document.getElementById("intro-overlay")!;
  overlay.classList.add("hidden");
  overlay.setAttribute("aria-hidden", "true");
}

// ─── Departure wizard ─────────────────────────────────────────────────────────
// Six sequential steps before the game starts. Narrative text is PLACEHOLDER —
// Vicente will replace these paragraphs with the final story text.

const WIZARD_NARRATIVES: Record<string, string> = {
  origin:
    "You had only minutes to decide what mattered most. The ship was small, the crossing unknown, and the northern island uncharted. One last thing — what did you bring?",
  companion:
    "Word had spread that you were leaving — the kind of word that moves between cellars and back doors. Two strangers found you in the last hours, both capable, both willing. You had room for one. Perhaps neither, if the food was thinner than you wanted to admit.",
  timing:
    "The ship was loaded, mostly. A few more hours and you could fit another crate of tools, another sack of grain. But you could see lanterns moving on the hill above the village. Stay, or go?",
  alarm:
    "The bells started at dusk. Three short peals — the signal for fire or worse. You were at the dock; your ship was ready, the lines about to come off. Across the square, you could see the cellar door — the winter stores were still inside. They would never serve their owners now. The choice was yours, and quick.",
  ship:
    "Cambrera. The island was smaller than the old charts had suggested — they were drawn before the war, by sailors who had no reason to lie about its size, only its colour. After three days offshore you found a cove and ran the bow into the sand. The ship had served. Now — what happens to her?",
  landing:
    "The coastline of Cambrera stretched in both directions. The mountain at the island's heart rose dark behind the surf — its old volcano dormant for centuries, but the ash that fed the shores still good for the plough. Wherever you beached, that would be home. Where do you put the keel down?",
};

export function showDepartureWizard(onComplete: (choices: DepartureChoices) => void): void {
  const choices: Partial<DepartureChoices> = {};
  const overlay = document.getElementById("departure-overlay")!;
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");

  type Step =
    | { key: "origin";    ids: OriginId[];          defs: typeof ORIGINS }
    | { key: "companion"; ids: CompanionId[];        defs: typeof COMPANIONS }
    | { key: "timing";    ids: DepartureTimingId[];  defs: typeof DEPARTURE_TIMINGS }
    | { key: "alarm";     ids: AlarmResponseId[];    defs: typeof ALARM_RESPONSES }
    | { key: "ship";      ids: ShipFateId[];         defs: typeof SHIP_FATES }
    | { key: "landing";   ids: LandingSpotId[];      defs: typeof LANDING_SPOTS };

  const steps: Step[] = [
    { key: "origin",    ids: Object.keys(ORIGINS) as OriginId[],                   defs: ORIGINS },
    { key: "companion", ids: Object.keys(COMPANIONS) as CompanionId[],             defs: COMPANIONS },
    { key: "timing",    ids: Object.keys(DEPARTURE_TIMINGS) as DepartureTimingId[], defs: DEPARTURE_TIMINGS },
    { key: "alarm",     ids: Object.keys(ALARM_RESPONSES) as AlarmResponseId[],    defs: ALARM_RESPONSES },
    { key: "ship",      ids: Object.keys(SHIP_FATES) as ShipFateId[],              defs: SHIP_FATES },
    { key: "landing",   ids: Object.keys(LANDING_SPOTS) as LandingSpotId[],        defs: LANDING_SPOTS },
  ];

  const stepTitles: Record<string, string> = {
    origin:    "What did you bring?",
    companion: "Who came with you?",
    timing:    "The moment of departure",
    alarm:     "The alarm bells",
    ship:      "The ship",
    landing:   "Where do you land?",
  };

  let stepIdx = 0;

  const renderStep = (): void => {
    const step = steps[stepIdx];
    const total = steps.length;
    const narrative = WIZARD_NARRATIVES[step.key];
    const title = stepTitles[step.key];

    const cardCount = step.ids.length;
    const colClass = cardCount === 2 ? "cols-2" : "cols-3";

    overlay.innerHTML = `
      <div id="departure-panel" role="dialog" aria-label="${title}">
        <div class="departure-step-indicator">Step ${stepIdx + 1} of ${total}</div>
        <h2>${title}</h2>
        <p class="departure-narrative">${narrative}</p>
        <div class="departure-cards ${colClass}" id="departure-cards"></div>
      </div>
    `;

    const container = overlay.querySelector("#departure-cards")!;
    for (const id of step.ids) {
      const def = (step.defs as Record<string, { name: string; bonusText: string }>)[id];
      const card = document.createElement("div");
      card.className = "departure-card";
      card.innerHTML = `
        <div class="departure-name">${def.name}</div>
        <div class="departure-bonus">${def.bonusText}</div>
      `;
      card.addEventListener("click", () => {
        (choices as Record<string, string>)[step.key === "ship" ? "shipFate" : step.key === "landing" ? "landingSpot" : step.key] = id;
        stepIdx++;
        if (stepIdx >= steps.length) {
          overlay.classList.add("hidden");
          overlay.setAttribute("aria-hidden", "true");
          onComplete(choices as DepartureChoices);
        } else {
          renderStep();
        }
      });
      container.appendChild(card);
    }
  };

  renderStep();
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
  renderTilePopup(state);
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

  const basket: TradeBasket = emptyBasket();

  const bump = (kind: "sell" | "buy", res: TradeResource, delta: number): void => {
    const next = basket[kind][res] + delta;
    if (next < 0) return;
    // Enforce the combined cap — delta-positive moves fail at the max.
    if (delta > 0 && basketTotal(basket) >= TRADE_MAX_PER_VISIT) return;
    // Can't schedule to sell more than we have.
    if (kind === "sell" && next > state[res]) return;
    basket[kind][res] = next;
    rerender();
  };

  const rerender = (): void => {
    overlay.innerHTML = buildTradeHTML(state, basket);
    bind();
  };

  const bind = (): void => {
    overlay.querySelectorAll<HTMLButtonElement>(".basket-step").forEach((btn) => {
      btn.addEventListener("click", () => {
        const kind = btn.dataset.kind as "sell" | "buy";
        const res = btn.dataset.res as TradeResource;
        const dir = btn.dataset.dir === "+" ? 1 : -1;
        bump(kind, res, dir);
      });
    });
    overlay.querySelector<HTMLButtonElement>(".trade-confirm")!.addEventListener("click", () => {
      if (!canExecuteTradeBasket(state, basket)) return;
      state.log.unshift(executeTradeBasket(state, basket));
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

function buildTradeHTML(state: GameState, basket: TradeBasket): string {
  const total = basketTotal(basket);
  const delta = basketGoldDelta(basket);
  const valid = total > 0 && canExecuteTradeBasket(state, basket);

  const resources: TradeResource[] = ["food", "wood", "stone"];
  const rows = resources.map((r) => basketRow(state, basket, r, total)).join("");

  const goldAfter = state.gold + delta;
  const goldClass = delta >= 0 ? "gold-pos" : "gold-neg";
  const goldSign = delta >= 0 ? `+${delta}` : `${delta}`;

  let status = "Pick any combination of buys and sells, then strike the deal.";
  if (total === 0) status = "Pick any combination of buys and sells, then strike the deal.";
  else if (goldAfter < 0) status = `Not enough gold — would leave you at ${goldAfter}.`;
  else status = `${total} / ${TRADE_MAX_PER_VISIT} units in the basket.`;

  return `
    <div id="trade-panel" role="dialog" aria-label="Merchant trade">
      <h2>✦ Travelling Merchants ✦</h2>
      <p class="trade-flavor">They've laid out their wares at the edge of the clearing. One basket of trades is on offer before they move on — up to ${TRADE_MAX_PER_VISIT} units in any mix.</p>
      <div class="trade-onhand">
        On hand: <strong>${state.gold}</strong> gold, <strong>${state.food}</strong> food, <strong>${state.wood}</strong> wood, <strong>${state.stone}</strong> stone
      </div>
      <div class="basket-grid">
        <div class="basket-head">
          <span></span><span>Sell</span><span>Buy</span><span class="align-right">After</span>
        </div>
        ${rows}
      </div>
      <div class="trade-totals">
        <span>${status}</span>
        <span>Net gold: <strong class="${goldClass}">${goldSign}</strong> → <strong>${goldAfter}</strong></span>
      </div>
      <div class="trade-buttons">
        <button class="trade-confirm" ${valid ? "" : "disabled"}>Trade</button>
        <button class="trade-decline">Decline</button>
      </div>
    </div>
  `;
}

function basketRow(state: GameState, basket: TradeBasket, r: TradeResource, total: number): string {
  const held = state[r];
  const sellQty = basket.sell[r];
  const buyQty = basket.buy[r];
  const after = held - sellQty + buyQty;
  const sellRate = TRADE_RATES.sell[r];
  const buyRate = TRADE_RATES.buy[r];
  const atCap = total >= TRADE_MAX_PER_VISIT;

  // +Sell disabled when capped OR player has nothing left to sell of this resource.
  const sellPlusDisabled = atCap || sellQty >= held;
  // +Buy disabled when capped OR the additional cost would exceed current gold
  //   (after accounting for whatever gold the basket already reserves/credits).
  const currentDelta = basketGoldDelta(basket);
  const nextBuyCost = buyRate;
  const goldAfterNextBuy = state.gold + currentDelta - nextBuyCost;
  const buyPlusDisabled = atCap || goldAfterNextBuy < 0;

  const stepper = (kind: "sell" | "buy", qty: number, plusDisabled: boolean): string => `
    <div class="basket-stepper">
      <button class="basket-step" data-kind="${kind}" data-res="${r}" data-dir="-" ${qty === 0 ? "disabled" : ""}>−</button>
      <span class="basket-qty">${qty}</span>
      <button class="basket-step" data-kind="${kind}" data-res="${r}" data-dir="+" ${plusDisabled ? "disabled" : ""}>+</button>
    </div>
  `;

  return `
    <div class="basket-row">
      <span class="basket-res">
        <strong>${r.charAt(0).toUpperCase()}${r.slice(1)}</strong>
        <span class="rate-hint">sell ${sellRate}g · buy ${buyRate}g</span>
      </span>
      ${stepper("sell", sellQty, sellPlusDisabled)}
      ${stepper("buy",  buyQty,  buyPlusDisabled)}
      <span class="basket-after align-right">${held}<span class="muted"> → </span><strong>${after}</strong></span>
    </div>
  `;
}

function renderTopbar(state: GameState): void {
  document.getElementById("year-display")!.textContent = `Year ${state.year}`;
  const el = document.getElementById("resources")!;
  el.innerHTML = "";
  const pop = totalPop(state);
  const kids = childCount(state);
  const fertile = fertileCount(state);
  const elders = elderCount(state);
  const cap = popCapacity(state);
  const popBreakdown = elders > 0
    ? `${pop}/${cap} (${fertile}A+${elders}E+${kids}C)`
    : `${pop}/${cap} (${fertile}A+${kids}C)`;
  const yields = projectedYields(state);
  el.append(
    resChip("Pop", popBreakdown),
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
  const fertile = fertileCount(state);
  const elders = elderCount(state);
  const kids = childCount(state);
  const parts: string[] = [`${fertile} adult${fertile === 1 ? "" : "s"}`];
  if (elders > 0) parts.push(`${elders} elder${elders === 1 ? "" : "s"}`);
  if (kids > 0) parts.push(`${kids} child${kids === 1 ? "" : "ren"}`);
  summary.textContent = `${parts.join(", ")} — ${idle} idle`;

  const container = document.getElementById("job-controls")!;
  container.innerHTML = "";
  for (const job of JOBS) {
    container.appendChild(jobRow(state, job, onChange));
  }
}

function jobRow(state: GameState, job: Job, onChange: () => void): HTMLElement {
  const row = document.createElement("div");
  row.className = "job-row";
  row.title = JOB_TOOLTIPS[job] ?? "";

  const count = jobCount(state, job);
  const cap = job === "scout" ? fertileCount(state) : totalReachableCapacity(state, job);
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
  const frontierExists = hasUndiscoveredFrontier(state.tiles);
  const canAddScout = job === "scout" && idleCount(state) > 0 && frontierExists;
  let canAddProd = false;
  if (job !== "scout") {
    canAddProd = idleCount(state) > 0 && findEligibleTile(state, job) !== null;
  }
  plus.disabled = state.gameOver || !(canAddScout || canAddProd);
  if (job === "scout" && !frontierExists) {
    plus.title = "The island is fully charted — no more land to explore.";
  } else if (job !== "scout" && idleCount(state) > 0 && !canAddProd) {
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
  panel.appendChild(houseRow(state, onChange));
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
  const blocker = buildBlockerReason(state, def.id);
  btn.disabled = blocker !== null;
  btn.title = blocker ?? def.description;
  btn.addEventListener("click", () => {
    build(state, def.id);
    onChange();
  });

  row.append(name, cost, btn);
  return row;
}

// Houses are repeatable — each row shows "N built" + a Build Another button.
// Cost and capacity are fixed constants so this doesn't need the BuildingDef
// shape. Pre-Long-House the row is greyed out but still visible, so the player
// can see the mechanic exists and what unlocks it.
function houseRow(state: GameState, onChange: () => void): HTMLElement {
  const row = document.createElement("div");
  row.className = "building-row house-row";
  row.title = `Private dwelling with a garden plot. +${HOUSE_CAPACITY} pop capacity, +${HOUSE_FOOD_YIELD} food/year. ${HOUSE_COST.wood} wood, ${HOUSE_COST.stone} stone each.`;

  const name = document.createElement("span");
  name.className = "building-name";
  const label = state.houses > 0 ? `Houses (${state.houses})` : "Houses";
  name.textContent = label;

  const cost = document.createElement("span");
  cost.className = "building-cost";
  const def: BuildingDef = {
    id: "house" as BuildingId,
    name: "Houses",
    description: "",
    cost: { wood: HOUSE_COST.wood, stone: HOUSE_COST.stone },
  };
  cost.append(...costChips(state, def));

  const btn = document.createElement("button");
  btn.textContent = state.houses > 0 ? "Build another" : "Build";
  const blocker = houseBlockerReason(state);
  btn.disabled = blocker !== null;
  btn.title = blocker ?? `+${HOUSE_CAPACITY} pop capacity, +${HOUSE_FOOD_YIELD} food/year`;
  btn.addEventListener("click", () => {
    buildHouse(state);
    onChange();
  });

  row.append(name, cost, btn);
  return row;
}

function costChips(state: GameState, def: BuildingDef): HTMLElement[] {
  const chips: HTMLElement[] = [];
  const entries: Array<["food" | "wood" | "stone" | "gold", string]> = [
    ["food", "food"],
    ["wood", "wood"],
    ["stone", "stone"],
    ["gold", "gold"],
  ];
  for (const [key, label] of entries) {
    const amount = def.cost[key];
    if (!amount) continue;
    const have = state[key];
    const chip = document.createElement("span");
    chip.className = `cost-chip ${have >= amount ? "ok" : "short"}`;
    chip.textContent = `${amount} ${label}`;
    chips.push(chip);
  }
  return chips;
}

function renderShipPanel(state: GameState, onChange: () => void): void {
  const panel = document.getElementById("ship-panel")!;
  panel.innerHTML = "";

  if (state.boat.status === "scrapped") {
    const status = document.createElement("div");
    status.className = "ship-status";
    const verb = state.departure.shipFate === "burn" ? "burned at anchor" : "broken down for timber";
    status.innerHTML = `<strong>Ship gone.</strong> She was ${verb} after landfall. No voyages possible.`;
    panel.appendChild(status);
    return;
  }

  if (state.boat.status === "lost") {
    const status = document.createElement("div");
    status.className = "ship-status";
    status.innerHTML = `<strong>Lost at sea.</strong> The ship never returned from her last voyage. No further voyages possible.`;
    panel.appendChild(status);
    return;
  }

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

  // Fishing-experience hint. Show current per-crew loss chance and, when it
  //   differs from the base, the bonus the settlement's fishers have earned.
  const reduction = fishingLossReduction(state.fishingYears);
  const lossPct = Math.round(effectiveCrewLossChance(state) * 100);
  const fishHint = document.createElement("div");
  fishHint.className = "ship-hint";
  if (reduction > 0) {
    const reducePct = Math.round(reduction * 100);
    fishHint.innerHTML = `Coastal lore (<strong>${state.fishingYears}</strong> fisher-years) — ${reducePct}% safer voyages. Crew loss chance: <strong>${lossPct}%</strong>.`;
  } else {
    fishHint.innerHTML = `No coastal lore yet — crew loss chance <strong>${lossPct}%</strong> per sailor. Fishers build maritime experience over time.`;
  }
  panel.appendChild(fishHint);

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

function renderTilePopup(state: GameState): void {
  const popup = document.getElementById("tile-popup")!;
  if (!state.selectedTile) {
    popup.classList.add("hidden");
    return;
  }
  const { x, y } = state.selectedTile;
  const t = state.tiles[y][x];
  popup.classList.remove("hidden");
  popup.innerHTML = describeTile(state, t, x, y);
}

function renderTileInfo(state: GameState, onChange: () => void): void {
  const panel = document.getElementById("tile-info")!;
  if (!state.selectedTile) {
    panel.innerHTML = `<div class="hint">Click a tile to inspect it.</div>`;
    return;
  }
  const { x, y } = state.selectedTile;
  const t = state.tiles[y][x];
  panel.innerHTML = describeTile(state, t, x, y);

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

function describeTile(state: GameState, t: Tile, x: number, y: number): string {
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
  const tileYield = describeTileYield(state, t);
  if (tileYield) lines.push(`<div class="tile-yield">${tileYield}</div>`);
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
      lines.push(`<div class="muted">Quarry worked dry — no more stone here. The seam is silent.</div>`);
    } else if (t.state === "worked") {
      lines.push(`<div>Reserve: ${t.reserve}</div>`);
      lines.push(`<div class="muted">A stone seam holds a finite amount; quarries eventually exhaust.</div>`);
    } else {
      lines.push(`<div class="muted">Reserve: unknown — and finite. Quarries can run dry.</div>`);
    }
  }
  return lines.join("");
}

// Per-tile yield projection — surfaces what the assigned workers actually
// produce (#23 — "tile use vs discovery confusion" — players didn't realise
// tiles produce based on assigned workers). Only shown when there ARE workers;
// otherwise tile state alone is enough.
function describeTileYield(state: GameState, t: Tile): string | null {
  if (t.workers <= 0) return null;
  if (t.state !== "worked" && t.state !== "cultivating") return null;
  const cultivating = t.state === "cultivating";
  const prefix = cultivating ? "Will yield (next year): " : "Yields: ";
  if (t.terrain === "grass") {
    const granaryBonus = state.buildings.granary ? 0.5 : 0;
    const perWorker = 2 + t.fertility + granaryBonus;
    const total = Math.floor(t.workers * perWorker);
    return `${prefix}+${total} food/year`;
  }
  if (t.terrain === "forest") {
    const lodgeBonus = state.buildings.hunting_lodge ? 0.5 : 0;
    const huntFood = Math.floor(t.hunterWorkers * (3 + lodgeBonus));
    const woodcutters = t.workers - t.hunterWorkers;
    const wood = woodcutters * 2;
    const parts: string[] = [];
    if (huntFood > 0) parts.push(`+${huntFood} food`);
    if (wood > 0) parts.push(`+${wood} wood`);
    return parts.length > 0 ? `${prefix}${parts.join(", ")}/year` : null;
  }
  if (t.terrain === "stone") {
    return `${prefix}+${t.workers} stone/year`;
  }
  if (t.terrain === "beach" || t.terrain === "river") {
    const lo = t.fishRichness > 0 ? 2 : 1;
    const hi = t.fishRichness > 0 ? 4 : 3;
    return `${prefix}+${lo * t.workers}–${hi * t.workers} food/year (variable)`;
  }
  return null;
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
  // Log is newest-first. Bracket each year's entries in a `<div class="year-group">`
  //   so the CSS gutter renders cleanly between years without us hand-tracking
  //   which entry is first/last in the group.
  let i = 0;
  while (i < state.log.length) {
    const year = state.log[i].year;
    const group = document.createElement("div");
    group.className = "year-group";
    const header = document.createElement("div");
    header.className = "year-header";
    header.textContent = `— Year ${year} —`;
    group.appendChild(header);
    while (i < state.log.length && state.log[i].year === year) {
      const entry = state.log[i];
      const div = document.createElement("div");
      div.className = `log-entry ${entry.tone}`;
      div.innerHTML = escapeHTML(entry.text);
      group.appendChild(div);
      i++;
    }
    log.appendChild(group);
  }
}

function escapeHTML(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
