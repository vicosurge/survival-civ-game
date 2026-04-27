import { HELP_SECTIONS } from "./help";
import { findEligibleTile, findWorkerToRemove, hasUndiscoveredFrontier, isInReach, totalReachableCapacity } from "./map";
import { JOB_TOOLTIPS } from "./narratives";
import { childCount, elderCount, fertileCount, idleCount, jobCount, popCapacity, projectedYields, saveGame, sheepHerdTotal, totalPop } from "./state";
import {
  acceptElderWork,
  acceptRefugees,
  assignWorker,
  build,
  buildBlockerReason,
  buildHouse,
  buildRoad,
  buildTownUpgrade,
  canBuildRoad,
  canDispatchBoat,
  canExecuteTradeBasket,
  declineTrade,
  declineRefugees,
  dispatchBoat,
  effectiveCrewLossChance,
  executeTradeBasket,
  fishingLossReduction,
  houseBlockerReason,
  isBuildingHidden,
  respectElders,
  setChildrenFree,
  setChildrenWorking,
  toggleChildPolicy,
  toggleElderPolicy,
  townUpgradeBlockerReason,
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
  CHICKEN_EGG_FOOD_RATE,
  CHILD_WORK_FOOD_YIELD,
  CHILD_WORK_WOOD_YIELD,
  COMPANIONS,
  CompanionId,
  DEPARTURE_TIMINGS,
  DepartureChoices,
  DepartureTimingId,
  FOOD_PER_ADULT,
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
  MerchantVisit,
  ELDER_WORK_FOOD_YIELD,
  MORALE_CHILD_FREE_CHOICE,
  MORALE_CHILD_WORK_CHOICE,
  MORALE_ELDER_WORK_CHOICE,
  MORALE_ELDER_RESPECTED_CHOICE,
  MORALE_REFUGEE_ACCEPT,
  MORALE_REFUGEE_REJECT,
  ORIGINS,
  OriginId,
  ROAD_COST,
  SHEEP_FOOD_PER_SLAUGHTER,
  SHEEP_HERD_CAP_PER_TILE,
  SHIP_FATES,
  ShipFateId,
  Tile,
  TILE_SIZE,
  TOWN_UPGRADES,
  TownUpgradeDef,
  TownUpgradeId,
  TRADE_RATES,
  TradeBasket,
  TradeResource,
  VERSION,
  basketGoldDelta,
  emptyBasket,
} from "./types";

export interface UIHandlers {
  onEndYear: () => void;
  onNewGame: () => void;
}

const SKIP_INTRO_KEY = "isle-of-cambrera-skip-intro";
const FEEDBACK_WORKER_URL = "https://cambrera.digimente.xyz/feedback";
const CHRONICLE_PAYLOAD_LIMIT = 256 * 1024;  // 256 KB; soft cap. The worker accepts up to 512KB.

let _selectedRating = 0;
// Latest GameState reference, refreshed every renderUI call. Static button
// handlers (export, feedback submit) read it without needing per-render rebinds.
let _stateRef: GameState | null = null;

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
  initFeedbackModal();
  initExportChronicle();
  initHelpHandlers();
  initMusicHandlers();
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
    startBackgroundMusic();
    _onIntroBegin();
  });
}

// ─── Feedback modal ───────────────────────────────────────────────────────────

function initFeedbackModal(): void {
  document.getElementById("feedback-btn")!.addEventListener("click", () => showFeedbackModal());
  document.getElementById("fb-cancel")!.addEventListener("click", hideFeedbackModal);
  document.getElementById("fb-submit")!.addEventListener("click", () => { void submitFeedback(); });
  document.getElementById("fb-text")!.addEventListener("input", () => {
    const len = (document.getElementById("fb-text")! as HTMLTextAreaElement).value.length;
    document.getElementById("fb-char-count")!.textContent = `${len} / 1000`;
  });
  buildRatingButtons();
}

function buildRatingButtons(): void {
  const container = document.getElementById("fb-rating")!;
  for (let i = 1; i <= 5; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fb-star";
    btn.textContent = "★";
    btn.title = `${i} star${i > 1 ? "s" : ""}`;
    btn.dataset.value = String(i);
    btn.addEventListener("click", () => {
      _selectedRating = i;
      updateRatingButtons();
    });
    container.appendChild(btn);
  }
}

function updateRatingButtons(): void {
  document.querySelectorAll<HTMLButtonElement>(".fb-star").forEach((btn) => {
    btn.classList.toggle("selected", Number(btn.dataset.value) <= _selectedRating);
  });
}

function showFeedbackModal(opts: { gameOver?: boolean; defaultIncludeChronicle?: boolean } = {}): void {
  _selectedRating = 0;
  (document.getElementById("fb-name")! as HTMLInputElement).value = "";
  (document.getElementById("fb-text")! as HTMLTextAreaElement).value = "";
  document.getElementById("fb-char-count")!.textContent = "0 / 1000";
  document.getElementById("fb-version")!.textContent = VERSION;
  document.getElementById("fb-status")!.textContent = "";
  document.getElementById("fb-status")!.className = "";
  (document.getElementById("fb-submit")! as HTMLButtonElement).disabled = false;
  (document.getElementById("fb-submit")! as HTMLButtonElement).textContent = "Send";
  document.getElementById("fb-intro")!.textContent = opts.gameOver
    ? "Your settlement has fallen. If you have a moment, tell us what happened — your chronicle helps us tune the early game."
    : "Help improve Isle of Cambrera. Takes about a minute.";
  const includeBox = document.getElementById("fb-include-chronicle") as HTMLInputElement;
  includeBox.checked = opts.defaultIncludeChronicle ?? false;
  updateChronicleSizeHint();
  updateRatingButtons();
  const overlay = document.getElementById("feedback-overlay")!;
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
}

function updateChronicleSizeHint(): void {
  const hint = document.getElementById("fb-chronicle-size");
  if (!hint) return;
  if (!_stateRef) {
    hint.textContent = "";
    return;
  }
  const text = serializeChronicle(_stateRef);
  const kb = Math.max(1, Math.round(text.length / 1024));
  hint.textContent = `(~${kb} KB; ${_stateRef.log.length} entries)`;
}

function hideFeedbackModal(): void {
  const overlay = document.getElementById("feedback-overlay")!;
  overlay.classList.add("hidden");
  overlay.setAttribute("aria-hidden", "true");
}

async function submitFeedback(): Promise<void> {
  const name = ((document.getElementById("fb-name")! as HTMLInputElement).value.trim() || "Anonymous").slice(0, 80);
  const text = (document.getElementById("fb-text")! as HTMLTextAreaElement).value.trim();
  const status = document.getElementById("fb-status")!;
  const btn = document.getElementById("fb-submit")! as HTMLButtonElement;
  const includeChronicle = (document.getElementById("fb-include-chronicle") as HTMLInputElement).checked;

  if (_selectedRating === 0) {
    status.textContent = "Please select a rating.";
    status.className = "fb-status-error";
    return;
  }
  if (text.length === 0) {
    status.textContent = "Please write some feedback.";
    status.className = "fb-status-error";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Sending…";
  status.textContent = "";

  let chronicle: string | undefined;
  if (includeChronicle && _stateRef) {
    chronicle = serializeChronicle(_stateRef);
    if (chronicle.length > CHRONICLE_PAYLOAD_LIMIT) {
      // Soft trim from the oldest end so the recent (most diagnostic) entries
      // survive. The header line stays at the top so the worker still parses it.
      chronicle = chronicle.slice(0, CHRONICLE_PAYLOAD_LIMIT) + "\n\n[chronicle truncated to fit upload limit]";
    }
  }

  try {
    const res = await fetch(FEEDBACK_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tester_name: name,
        rating: _selectedRating,
        feedback: text,
        version: VERSION,
        ...(chronicle !== undefined ? { chronicle } : {}),
      }),
    });
    if (res.ok) {
      status.textContent = "Feedback sent. Thank you.";
      status.className = "fb-status-ok";
      setTimeout(hideFeedbackModal, 1800);
    } else {
      status.textContent = "Something went wrong — please try again.";
      status.className = "fb-status-error";
      btn.disabled = false;
      btn.textContent = "Send";
    }
  } catch {
    status.textContent = "Could not reach the server.";
    status.className = "fb-status-error";
    btn.disabled = false;
    btn.textContent = "Send";
  }
}

// ─── Chronicle export ─────────────────────────────────────────────────────────

function initExportChronicle(): void {
  document.getElementById("export-chronicle-btn")!.addEventListener("click", () => {
    if (!_stateRef) return;
    downloadChronicle(_stateRef);
  });
}

// Serializes the in-memory log into a human-readable chronicle. Oldest year
// first so the file reads as a narrative; in-game the log is newest-on-top.
// Header carries the metadata you need to reconstruct the run shape.
function serializeChronicle(state: GameState): string {
  const lines: string[] = [];
  lines.push("Isle of Cambrera — Chronicle");
  lines.push(`Version: ${VERSION}`);
  lines.push(`Year reached: ${state.year}`);
  lines.push(`Status: ${state.gameOver ? "ENDED" : "in progress"}`);
  lines.push(
    `Population: ${totalPop(state)} (children ${childCount(state)} / fertile ${fertileCount(state)} / elders ${elderCount(state)})`,
  );
  lines.push(
    `Resources: food ${state.food}, wood ${state.wood}, stone ${state.stone}, gold ${state.gold}, wool ${state.wool}`,
  );
  lines.push(`Morale: ${Math.round(state.morale)}`);
  const d = state.departure;
  lines.push(
    `Departure: origin=${d.origin}, companion=${d.companion}, timing=${d.timing}, alarm=${d.alarm}, ship=${d.shipFate}, landing=${d.landingSpot}`,
  );
  lines.push("");

  const oldestFirst = [...state.log].reverse();
  let lastYear = Number.NEGATIVE_INFINITY;
  for (const entry of oldestFirst) {
    if (entry.year !== lastYear) {
      if (lastYear !== Number.NEGATIVE_INFINITY) lines.push("");
      lines.push(`— Year ${entry.year} —`);
      lastYear = entry.year;
    }
    lines.push(entry.text);
  }
  return lines.join("\n");
}

function downloadChronicle(state: GameState): void {
  const text = serializeChronicle(state);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cambrera-chronicle-year${state.year}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Post-mortem feedback prompt ──────────────────────────────────────────────
// Auto-opens the feedback modal the first time a save flips into game-over
// state. The chronicle attach is pre-checked because the run is most useful to
// us as a diagnostic. One-shot per save (gameOverFeedbackShown).

export function maybeShowGameOverFeedback(state: GameState, onResolve: () => void): void {
  if (!state.gameOver || state.gameOverFeedbackShown) return;
  // Don't stack the modal on top of any other blocking overlay.
  if (state.merchantVisit || state.pendingRefugees || state.pendingElderDecision || state.pendingChildDecision) {
    return;
  }
  if (!document.getElementById("feedback-overlay")!.classList.contains("hidden")) return;
  state.gameOverFeedbackShown = true;
  saveGame(state);
  showFeedbackModal({ gameOver: true, defaultIncludeChronicle: true });
  onResolve();
}

// ─── Help modal ───────────────────────────────────────────────────────────────

function initHelpHandlers(): void {
  document.getElementById("help-btn-topbar")!.addEventListener("click", showHelpModal);
  document.getElementById("help-btn-strip")!.addEventListener("click", showHelpModal);
}

function showHelpModal(): void {
  const overlay = document.getElementById("help-overlay")!;
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");

  const sectionsHtml = HELP_SECTIONS.map((s, i) => `
    <details class="help-section"${i === 0 ? " open" : ""}>
      <summary>${s.title}</summary>
      <div class="help-body">${s.body}</div>
    </details>
  `).join("");

  overlay.innerHTML = `
    <div id="help-panel" role="dialog" aria-label="Help">
      <h2>Isle of Cambrera — Reference</h2>
      <p class="help-intro">Skim the section that matches the question you have. Click a heading to expand or collapse.</p>
      <div class="help-sections">${sectionsHtml}</div>
      <div class="help-buttons">
        <button class="help-close">Close</button>
      </div>
    </div>
  `;

  overlay.querySelector<HTMLButtonElement>(".help-close")!.addEventListener("click", () => {
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = "";
  });
}

// ─── Background music ─────────────────────────────────────────────────────────
// HTML5 audio element does the loop. Mute preference persists in localStorage.
// Browsers block autoplay until the user interacts with the page — the intro
// "Begin" handler triggers the first play() call from within a click event,
// which satisfies the autoplay policy.

const MUSIC_MUTED_KEY = "isle-of-cambrera-music-muted";

function isMusicMuted(): boolean {
  return localStorage.getItem(MUSIC_MUTED_KEY) === "1";
}

function initMusicHandlers(): void {
  const audio = document.getElementById("bg-music") as HTMLAudioElement;
  audio.volume = 0.2;
  audio.muted = isMusicMuted();
  updateMusicToggleLabel();
  document.getElementById("music-toggle")!.addEventListener("click", () => {
    const muted = !audio.muted;
    audio.muted = muted;
    if (muted) localStorage.setItem(MUSIC_MUTED_KEY, "1");
    else localStorage.removeItem(MUSIC_MUTED_KEY);
    updateMusicToggleLabel();
    // If the user un-mutes before the first user-gesture-triggered play(),
    // try to start now — they're un-muting via a click, which counts.
    if (!muted && audio.paused) audio.play().catch(() => { /* autoplay blocked, will retry on Begin */ });
  });
}

function updateMusicToggleLabel(): void {
  const audio = document.getElementById("bg-music") as HTMLAudioElement;
  const btn = document.getElementById("music-toggle")!;
  btn.textContent = audio.muted ? "♪" : "♫";
  btn.title = audio.muted ? "Music muted — click to unmute" : "Music on — click to mute";
}

// Called from the intro Begin handler. The click satisfies browser autoplay
// policies. If the music file isn't present yet, this fails silently.
export function startBackgroundMusic(): void {
  const audio = document.getElementById("bg-music") as HTMLAudioElement;
  if (!audio || isMusicMuted()) return;
  audio.play().catch(() => { /* file missing or blocked — silent */ });
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
    "Bandits have been spotted in a nearby village — you cannot stay any longer. You must sail tomorrow. The ship is small, the crossing unknown, and the northern island uncharted. One last thing — what do you bring?",
  companion:
    "Word had spread that you were leaving — the kind of word that moves between cellars and back doors. Two strangers found you in the last hours, both capable, both willing. You had room for one. Perhaps neither, if the food was thinner than you wanted to admit.",
  timing:
    "The ship was loaded, mostly. A few more hours and you could fit another crate of tools, another sack of grain. But you could see lanterns moving on the hill above the village. Stay, or go?",
  alarm:
    "The bells started at dusk. Three short peals — the signal for fire or worse. You were at the dock; your ship was ready, the lines about to come off. Across the square, you could see the cellar door — the winter stores were still inside. They would never serve their owners now. The choice was yours, and quick.",
  landing:
    "Cambrera. The island was smaller than the old charts had suggested — they were drawn before the war, by sailors who had no reason to lie about its size, only its colour. The mountain at its heart rose dark behind the surf — an old volcano, dormant for centuries, but the ash that fed the shores still good for the plough. Wherever you beached, that would be home. Where do you put the keel down?",
  ship:
    "The bow grates against the sand. After three days at sea you have made landfall, and the ship that brought you sits in the shallows — empty, salt-stained, idle. She has served. Now — what happens to her?",
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
    { key: "landing",   ids: Object.keys(LANDING_SPOTS) as LandingSpotId[],        defs: LANDING_SPOTS },
    { key: "ship",      ids: Object.keys(SHIP_FATES) as ShipFateId[],              defs: SHIP_FATES },
  ];

  const stepTitles: Record<string, string> = {
    origin:    "What did you bring?",
    companion: "Who came with you?",
    timing:    "The moment of departure",
    alarm:     "The alarm bells",
    landing:   "Where do you land?",
    ship:      "The ship",
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
  _stateRef = state;
  renderTopbar(state);
  renderAllocation(state, onAllocChange);
  renderLivestock(state, onAllocChange);
  renderBuildingsPanel(state, onAllocChange);
  renderShipPanel(state, onAllocChange);
  renderTileInfo(state, onAllocChange);
  renderTilePopup(state);
  renderLog(state);
  const endBtn = document.getElementById("end-turn-btn") as HTMLButtonElement;
  endBtn.disabled = state.gameOver
    || state.merchantVisit !== null
    || !!state.pendingRefugees
    || state.pendingElderDecision
    || state.pendingChildDecision;
  endBtn.textContent = state.gameOver
    ? "— Settlement Failed —"
    : state.merchantVisit !== null
      ? "Merchants waiting…"
      : state.pendingRefugees
        ? "Refugees at the gate…"
        : state.pendingElderDecision
          ? "Council awaiting…"
          : state.pendingChildDecision
            ? "Council awaiting…"
            : "End Year";
}

export function maybeShowTradeModal(state: GameState, onResolve: () => void): void {
  if (!state.merchantVisit || state.gameOver) {
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
    const visit = state.merchantVisit!;
    const next = basket[kind][res] + delta;
    if (next < 0) return;
    const held = res === "wool" ? state.wool : (state as unknown as Record<string, number>)[res] as number;
    if (kind === "sell" && next > held) return;
    if (kind === "buy" && next > visit.sellStock[res]) return;
    // Patrician cargo constraint: sellTotal ≤ cargoCapacity − stockTotal + buyTotal
    if (kind === "sell" && delta > 0) {
      const resources: TradeResource[] = ["food", "wood", "stone", "wool"];
      const stockTotal = resources.reduce((s, r) => s + visit.sellStock[r], 0);
      const buyTotal = resources.reduce((s, r) => s + basket.buy[r], 0);
      const newSellTotal = resources.reduce((s, r) => s + basket.sell[r], 0) + delta;
      if (newSellTotal > visit.cargoCapacity - stockTotal + buyTotal) return;
    }
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
  const visit = state.merchantVisit!;
  const delta = basketGoldDelta(basket);
  const valid = canExecuteTradeBasket(state, basket);

  const resources: TradeResource[] = ["food", "wood", "stone", "wool"];
  const stockTotal = resources.reduce((s, r) => s + visit.sellStock[r], 0);
  const buyTotal = resources.reduce((s, r) => s + basket.buy[r], 0);
  const sellTotal = resources.reduce((s, r) => s + basket.sell[r], 0);
  const sellCap = visit.cargoCapacity - stockTotal + buyTotal;

  const rows = resources.map((r) => basketRow(state, basket, r, visit)).join("");

  const goldAfter = state.gold + delta;
  const goldClass = delta >= 0 ? "gold-pos" : "gold-neg";
  const goldSign = delta >= 0 ? `+${delta}` : `${delta}`;

  let status: string;
  if (sellTotal === 0 && buyTotal === 0) {
    status = "Select goods to trade, then strike the deal.";
  } else if (goldAfter < 0) {
    status = `Not enough gold — would leave you at ${goldAfter}.`;
  } else {
    status = `Selling ${sellTotal}/${sellCap} cargo slots. Buying ${buyTotal}.`;
  }

  const offered = resources.filter((r) => visit.sellStock[r] > 0)
    .map((r) => `${visit.sellStock[r]} ${r}`).join(", ");

  const onHandParts = [`<strong>${state.gold}</strong> gold`, `<strong>${state.food}</strong> food`,
    `<strong>${state.wood}</strong> wood`, `<strong>${state.stone}</strong> stone`];
  if (state.wool > 0) onHandParts.push(`<strong>${state.wool}</strong> wool`);

  return `
    <div id="trade-panel" role="dialog" aria-label="Merchant trade">
      <h2>✦ Travelling Merchants ✦</h2>
      <p class="trade-flavor">Their wagon holds <strong>${visit.cargoCapacity}</strong> cargo units. Buying from them frees space for your goods — wool is yours to sell; they carry none.</p>
      <div class="trade-onhand">
        On hand: ${onHandParts.join(", ")}
      </div>
      <div class="trade-onhand trade-merchant-stock">
        They offer: <em>${offered || "nothing today"}</em>
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

export function maybeShowRefugeesModal(state: GameState, onResolve: () => void): void {
  const overlay = document.getElementById("refugees-overlay")!;
  if (!state.pendingRefugees || state.gameOver) {
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = "";
    return;
  }

  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");

  const { count, text } = state.pendingRefugees;
  const foodCost = count * FOOD_PER_ADULT;
  overlay.innerHTML = `
    <div id="refugees-panel" role="dialog" aria-label="Refugees at the Gate">
      <h2>Refugees at the Gate</h2>
      <p class="refugees-flavor">${text}</p>
      <p class="refugees-impact">
        Accepting will add <strong>${count}</strong> adult${count === 1 ? "" : "s"} to your settlement.
        They will draw <strong>${foodCost} food per year</strong> from next year onward.
      </p>
      <div class="refugees-buttons">
        <button class="refugees-accept">Take them in (+${MORALE_REFUGEE_ACCEPT} morale)</button>
        <button class="refugees-decline">Send them away (${MORALE_REFUGEE_REJECT} morale)</button>
      </div>
    </div>
  `;

  overlay.querySelector<HTMLButtonElement>(".refugees-accept")!.addEventListener("click", () => {
    state.log.unshift(acceptRefugees(state));
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = "";
    onResolve();
  });
  overlay.querySelector<HTMLButtonElement>(".refugees-decline")!.addEventListener("click", () => {
    state.log.unshift(declineRefugees(state));
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = "";
    onResolve();
  });
}

export function maybeShowElderDecisionModal(state: GameState, onResolve: () => void): void {
  const overlay = document.getElementById("elder-overlay")!;
  if (!state.pendingElderDecision || state.gameOver) {
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = "";
    return;
  }

  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");

  overlay.innerHTML = `
    <div id="elder-panel" role="dialog" aria-label="The Council of Elders">
      <h2>The Elder Question</h2>
      <p class="refugees-flavor">
        Your settlement has seen ${state.elderTransitions} men and women pass into their elder years.
        The community gathers to decide what is owed to those who founded and built this place —
        and what they can still give.
      </p>
      <div class="elder-choices">
        <div class="elder-choice">
          <h3>Elders Work On</h3>
          <p>They tend gardens, mend tools, and keep the fires — lighter tasks, but real ones.
             Each elder contributes <strong>+${ELDER_WORK_FOOD_YIELD} food/year</strong>.
             Some will resent the burden.</p>
          <button class="elder-btn-work">Put them to work (${MORALE_ELDER_WORK_CHOICE} morale)</button>
        </div>
        <div class="elder-choice">
          <h3>Honour the Elders</h3>
          <p>They govern, counsel, and pass down what they know. No labour, but their presence
             steadies the settlement. The community is proud of this choice.</p>
          <button class="elder-btn-respect">Honour their rest (+${MORALE_ELDER_RESPECTED_CHOICE} morale)</button>
        </div>
      </div>
    </div>
  `;

  overlay.querySelector<HTMLButtonElement>(".elder-btn-work")!.addEventListener("click", () => {
    state.log.unshift(acceptElderWork(state));
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = "";
    onResolve();
  });
  overlay.querySelector<HTMLButtonElement>(".elder-btn-respect")!.addEventListener("click", () => {
    state.log.unshift(respectElders(state));
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = "";
    onResolve();
  });
}

function basketRow(state: GameState, basket: TradeBasket, r: TradeResource, visit: MerchantVisit): string {
  const held = r === "wool" ? state.wool : (state as unknown as Record<string, number>)[r] as number;
  const sellQty = basket.sell[r];
  const buyQty = basket.buy[r];
  const after = held - sellQty + buyQty;
  const sellRate = TRADE_RATES.sell[r];
  const buyRate = TRADE_RATES.buy[r];

  // Patrician sell cap: sellTotal ≤ cargoCapacity − stockTotal + buyTotal
  const resources: TradeResource[] = ["food", "wood", "stone", "wool"];
  const stockTotal = resources.reduce((s, res) => s + visit.sellStock[res], 0);
  const buyTotal = resources.reduce((s, res) => s + basket.buy[res], 0);
  const sellTotal = resources.reduce((s, res) => s + basket.sell[res], 0);
  const sellCap = visit.cargoCapacity - stockTotal + buyTotal;

  const sellPlusDisabled = sellQty >= held || sellTotal >= sellCap;
  const goldAfterNextBuy = state.gold + basketGoldDelta(basket) - buyRate;
  const buyPlusDisabled = r === "wool" || buyQty >= visit.sellStock[r] || goldAfterNextBuy < 0;

  const stepper = (kind: "sell" | "buy", qty: number, plusDisabled: boolean): string => `
    <div class="basket-stepper">
      <button class="basket-step" data-kind="${kind}" data-res="${r}" data-dir="-" ${qty === 0 ? "disabled" : ""}>−</button>
      <span class="basket-qty">${qty}</span>
      <button class="basket-step" data-kind="${kind}" data-res="${r}" data-dir="+" ${plusDisabled ? "disabled" : ""}>+</button>
    </div>
  `;

  const buyCell = r === "wool"
    ? `<div class="basket-stepper"><span class="basket-qty" style="color:#8a6535">—</span></div>`
    : stepper("buy", buyQty, buyPlusDisabled);

  return `
    <div class="basket-row">
      <span class="basket-res">
        <strong>${r.charAt(0).toUpperCase()}${r.slice(1)}</strong>
        <span class="rate-hint">sell ${sellRate}g${r !== "wool" ? ` · buy ${buyRate}g` : " only"}</span>
      </span>
      ${stepper("sell", sellQty, sellPlusDisabled)}
      ${buyCell}
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
  const chips: HTMLElement[] = [
    resChip("Pop", popBreakdown),
    resChip("Food", state.food, netDelta(yields.food.net)),
    resChip("Wood", state.wood, productionDelta(yields.wood)),
    resChip("Stone", state.stone, productionDelta(yields.stone)),
    resChip("Gold", state.gold),
  ];
  if (state.wool > 0 || yields.wool > 0) {
    chips.push(resChip("Wool", state.wool, yields.wool > 0 ? productionDelta(yields.wool) : undefined));
  }
  chips.push(moraleChip(state.morale));
  el.append(...chips);
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
      farmer: "grassland", shepherd: "grassland", woodcutter: "forest", hunter: "forest",
      quarryman: "stone", fisher: "shallows",
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

  // Town-centre upgrades render first — they're stabilising infrastructure,
  // available from turn 1, and visually separated from the one-time buildings
  // by the dashed border on the last upgrade row.
  for (const id of Object.keys(TOWN_UPGRADES) as TownUpgradeId[]) {
    panel.appendChild(townUpgradeRow(state, TOWN_UPGRADES[id], onChange));
  }

  // One-time buildings — gate-blocked ones are hidden until their gate is met
  // (long_house excepted: it's the major civic milestone and stays visible).
  const ids = Object.keys(BUILDINGS) as BuildingId[];
  for (const id of ids) {
    if (isBuildingHidden(state, id)) continue;
    panel.appendChild(buildingRow(state, BUILDINGS[id], onChange));
  }
  panel.appendChild(houseRow(state, onChange));

  // Governance opener — surfaces only once the Long House civic anchor is up.
  if (state.buildings.long_house) {
    panel.appendChild(governanceOpenerRow(state, onChange));
  }
}

function townUpgradeRow(state: GameState, def: TownUpgradeDef, onChange: () => void): HTMLElement {
  const row = document.createElement("div");
  row.className = "building-row town-upgrade-row";
  row.title = def.description;
  const built = state.townUpgrades[def.id];

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
  // Cast through BuildingDef to reuse costChips. The "id" is unused at this
  // path so we don't need to invent a fake BuildingId.
  const costShim: BuildingDef = {
    id: def.id as unknown as BuildingId,
    name: def.name,
    description: def.description,
    cost: def.cost,
  };
  cost.append(...costChips(state, costShim));

  const btn = document.createElement("button");
  btn.textContent = "Build";
  const blocker = townUpgradeBlockerReason(state, def.id);
  btn.disabled = blocker !== null;
  btn.title = blocker ?? def.description;
  btn.addEventListener("click", () => {
    buildTownUpgrade(state, def.id);
    onChange();
  });

  row.append(name, cost, btn);
  return row;
}

function governanceOpenerRow(state: GameState, onChange: () => void): HTMLElement {
  const row = document.createElement("div");
  row.className = "building-row governance-opener-row";
  row.title = "Review and revisit standing laws (elder labour, child labour, future).";

  const name = document.createElement("span");
  name.className = "building-name";
  name.textContent = "Governance";

  const detail = document.createElement("span");
  detail.className = "governance-summary";
  const parts: string[] = [];
  if (state.elderPolicy !== null) parts.push(`elders: ${state.elderPolicy}`);
  if (state.childPolicy !== null) parts.push(`children: ${state.childPolicy}`);
  detail.textContent = parts.length > 0 ? parts.join(", ") : "no laws yet";

  const btn = document.createElement("button");
  btn.textContent = "Open";
  btn.addEventListener("click", () => {
    showGovernanceModal(state, onChange);
  });

  row.append(name, detail, btn);
  return row;
}

// ─── Governance modal ─────────────────────────────────────────────────────────
// Reusable panel surfaced from the Long House. Lists currently-active civic
// laws with toggle buttons. Re-applying the cost on every flip keeps reversible
// decisions weighty (Frostpunk pattern).

function showGovernanceModal(state: GameState, onChange: () => void): void {
  const overlay = document.getElementById("governance-overlay")!;
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");

  const close = (): void => {
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = "";
    onChange();
  };

  const rerender = (): void => {
    overlay.innerHTML = buildGovernanceHTML(state);
    overlay.querySelector<HTMLButtonElement>(".governance-close")!.addEventListener("click", close);
    overlay.querySelector<HTMLButtonElement>(".elder-toggle-btn")?.addEventListener("click", () => {
      const entry = toggleElderPolicy(state);
      if (entry) state.log.unshift(entry);
      rerender();
    });
    overlay.querySelector<HTMLButtonElement>(".child-toggle-btn")?.addEventListener("click", () => {
      const entry = toggleChildPolicy(state);
      if (entry) state.log.unshift(entry);
      rerender();
    });
  };

  rerender();
}

function buildGovernanceHTML(state: GameState): string {
  const laws: string[] = [];

  if (state.elderPolicy !== null) {
    const working = state.elderPolicy === "working";
    const currentLabel = working ? "Working" : "Respected";
    const flipLabel = working ? "Honour their rest" : "Put them to work";
    const flipMorale = working ? `+${MORALE_ELDER_RESPECTED_CHOICE}` : `${MORALE_ELDER_WORK_CHOICE}`;
    const summary = working
      ? `Elders contribute light tasks (+${ELDER_WORK_FOOD_YIELD} food/year each).`
      : "Elders teach, counsel, and rest.";
    laws.push(`
      <div class="governance-law">
        <div class="governance-law-head">
          <span class="governance-law-name">Elders</span>
          <span class="governance-law-state">${currentLabel}</span>
        </div>
        <p class="governance-law-summary">${summary}</p>
        <button class="elder-toggle-btn">${flipLabel} (${flipMorale} morale)</button>
      </div>
    `);
  }

  if (state.childPolicy !== null) {
    const working = state.childPolicy === "working";
    const currentLabel = working ? "Working" : "Free";
    const flipLabel = working ? "Release them from chores" : "Call them to small tasks";
    const flipMorale = working ? `+${MORALE_CHILD_FREE_CHOICE}` : `${MORALE_CHILD_WORK_CHOICE}`;
    const summary = working
      ? `Children gather and tend (+${CHILD_WORK_FOOD_YIELD} food, +${CHILD_WORK_WOOD_YIELD} wood per child/year, floored).`
      : "Children play, learn, and grow up.";
    laws.push(`
      <div class="governance-law">
        <div class="governance-law-head">
          <span class="governance-law-name">Children</span>
          <span class="governance-law-state">${currentLabel}</span>
        </div>
        <p class="governance-law-summary">${summary}</p>
        <button class="child-toggle-btn">${flipLabel} (${flipMorale} morale)</button>
      </div>
    `);
  }

  const body = laws.length > 0
    ? laws.join("")
    : `<p class="governance-empty">No civic laws are in force yet. Decisions will appear here as the settlement faces them.</p>`;

  return `
    <div id="governance-panel" role="dialog" aria-label="Governance">
      <h2>The Long House</h2>
      <p class="governance-flavor">
        Standing laws of the settlement. Each flip carries the same weight as the first decision —
        the people remember.
      </p>
      ${body}
      <div class="governance-buttons">
        <button class="governance-close">Close</button>
      </div>
    </div>
  `;
}

// First-time child-decision modal — same shape as the elder one. Triggered by
// state.pendingChildDecision in the turn pipeline.
export function maybeShowChildDecisionModal(state: GameState, onResolve: () => void): void {
  const overlay = document.getElementById("child-overlay")!;
  if (!state.pendingChildDecision || state.gameOver) {
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = "";
    return;
  }

  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");

  overlay.innerHTML = `
    <div id="child-panel" role="dialog" aria-label="The Question of the Children">
      <h2>The Question of the Children</h2>
      <p class="refugees-flavor">
        ${childCount(state)} children now run between the huts. With the Long House standing,
        the village asks the question openly: should the young be put to small tasks alongside the adults,
        or kept to their own days while the settlement can still afford it?
      </p>
      <div class="elder-choices">
        <div class="elder-choice">
          <h3>Children Help</h3>
          <p>They gather kindling, weed the garden, watch the chickens.
             <strong>+${CHILD_WORK_FOOD_YIELD} food, +${CHILD_WORK_WOOD_YIELD} wood per child/year</strong> (floored).
             Some grumble that childhood is short enough.</p>
          <button class="child-btn-work">Put them to small tasks (${MORALE_CHILD_WORK_CHOICE} morale)</button>
        </div>
        <div class="elder-choice">
          <h3>Children Stay Free</h3>
          <p>They play and learn from the elders. The settlement carries them — for now.
             The community is glad of the choice.</p>
          <button class="child-btn-free">Let them be children (+${MORALE_CHILD_FREE_CHOICE} morale)</button>
        </div>
      </div>
    </div>
  `;

  overlay.querySelector<HTMLButtonElement>(".child-btn-work")!.addEventListener("click", () => {
    state.log.unshift(setChildrenWorking(state));
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = "";
    onResolve();
  });
  overlay.querySelector<HTMLButtonElement>(".child-btn-free")!.addEventListener("click", () => {
    state.log.unshift(setChildrenFree(state));
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = "";
    onResolve();
  });
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

function renderLivestock(state: GameState, onChange: () => void): void {
  const section = document.getElementById("livestock-section")!;
  const panel = document.getElementById("livestock-panel")!;

  const shepherdCount = jobCount(state, "shepherd");
  const hasChickens = state.buildings.chicken_coop;

  if (shepherdCount === 0 && !hasChickens) {
    section.classList.add("hidden");
    return;
  }
  section.classList.remove("hidden");

  let html = "";

  if (shepherdCount > 0) {
    const totalSheep = sheepHerdTotal(state);
    let shepherdTiles = 0;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (state.tiles[y][x].shepherdWorkers > 0) shepherdTiles++;
      }
    }
    const foodFromSlaughter = state.sheepSlaughter * SHEEP_FOOD_PER_SLAUGHTER;
    html += `
      <div class="livestock-row">
        <span class="livestock-label">Sheep:</span>
        <span class="livestock-value">${totalSheep} (${shepherdTiles} tile${shepherdTiles === 1 ? "" : "s"})</span>
      </div>
      <div class="livestock-row">
        <span class="livestock-label">Cull/yr:</span>
        <button class="livestock-step" id="slaughter-minus" ${state.sheepSlaughter <= 0 ? "disabled" : ""}>−</button>
        <span class="livestock-qty">${state.sheepSlaughter}</span>
        <button class="livestock-step" id="slaughter-plus">+</button>
        <span class="livestock-hint">${state.sheepSlaughter > 0 ? `+${foodFromSlaughter} food/yr` : "no culling"}</span>
      </div>
      <div class="livestock-note">Herds grow +2/yr; cap ${SHEEP_HERD_CAP_PER_TILE}/tile.</div>
    `;
  }

  if (hasChickens) {
    if (shepherdCount > 0) html += `<div class="livestock-divider"></div>`;
    const eggYield = Math.floor(state.chickens * CHICKEN_EGG_FOOD_RATE);
    html += `
      <div class="livestock-row">
        <span class="livestock-label">Chickens:</span>
        <span class="livestock-value">${state.chickens}/${state.chickenCapacity}</span>
        <span class="livestock-hint">+${eggYield} food/yr (eggs)</span>
      </div>
      <div class="livestock-note">Flock grows ~40%/yr; surplus culled at cap.</div>
    `;
  }

  panel.innerHTML = html;

  panel.querySelector<HTMLButtonElement>("#slaughter-minus")?.addEventListener("click", () => {
    state.sheepSlaughter = Math.max(0, state.sheepSlaughter - 1);
    onChange();
  });
  panel.querySelector<HTMLButtonElement>("#slaughter-plus")?.addEventListener("click", () => {
    state.sheepSlaughter += 1;
    onChange();
  });
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
  if (t.state === "cultivating" && t.terrain === "grass") {
    lines.push(`<div class="muted">First year: settlers break ground — no harvest until next year.</div>`);
  }
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
    const shepherds = t.shepherdWorkers;
    const farmers = t.workers - shepherds;
    const parts: string[] = [];
    if (farmers > 0) {
      const granaryBonus = state.buildings.granary ? 0.5 : 0;
      const perWorker = 2 + t.fertility + granaryBonus;
      const total = Math.floor(farmers * perWorker);
      const bonusParts: string[] = ["2 base"];
      if (t.fertility > 0) bonusParts.push("fertile +1");
      if (granaryBonus > 0) bonusParts.push("granary +0.5");
      parts.push(`+${total} food (${bonusParts.join(", ")}/farmer)`);
    }
    if (shepherds > 0) {
      parts.push(`+${shepherds} food (milk), +${shepherds} wool`);
    }
    return parts.length > 0 ? `${prefix}${parts.join("; ")}/year` : null;
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
    if (t.terrain === "grass") {
      if (t.state === "worked") return t.shepherdWorkers > 0 ? "Pasture" : "Farmland";
      return t.shepherdWorkers > 0 ? "Fallow Pasture" : "Fallow Farmland";
    }
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
