import { render } from "./render";
import { clearSave, loadGame, newGame, saveGame } from "./state";
import { endYear } from "./turn";
import { DepartureChoices, OriginId } from "./types";
import { attachCanvasClick, initUI, maybeShowIntro, maybeShowRefugeesModal, maybeShowTradeModal, renderUI, showDepartureWizard } from "./ui";

const canvas = document.getElementById("map") as HTMLCanvasElement;
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("Canvas 2D context unavailable");

// Placeholder choices used only while the departure wizard overlay is visible.
const PLACEHOLDER_DEPARTURE: DepartureChoices = {
  origin: "seeds" as OriginId,
  companion: "nobody",
  timing: "hasty",
  alarm: "run",
  shipFate: "keep",
  landingSpot: "western_shore",
};

const saved = loadGame();
let state = saved ?? newGame(PLACEHOLDER_DEPARTURE);

function redraw(): void {
  render(ctx!, state);
  renderUI(state, redraw);
  maybeShowTradeModal(state, () => {
    saveGame(state);
    redraw();
  });
  maybeShowRefugeesModal(state, () => {
    saveGame(state);
    redraw();
  });
}

function startNewGame(choices: DepartureChoices): void {
  state = newGame(choices);
  saveGame(state);
  redraw();
}

initUI({
  onEndYear: () => {
    endYear(state);
    saveGame(state);
    redraw();
  },
  onNewGame: () => {
    clearSave();
    maybeShowIntro(() => showDepartureWizard(startNewGame));
  },
});

attachCanvasClick(canvas, () => state, redraw);

redraw();

if (!saved) {
  maybeShowIntro(() => showDepartureWizard(startNewGame));
} else {
  maybeShowIntro(() => {});
}
