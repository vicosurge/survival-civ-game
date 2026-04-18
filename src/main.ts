import { render } from "./render";
import { clearSave, loadGame, newGame, saveGame } from "./state";
import { endYear } from "./turn";
import { GameState } from "./types";
import { attachCanvasClick, initUI, renderUI } from "./ui";

const canvas = document.getElementById("map") as HTMLCanvasElement;
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("Canvas 2D context unavailable");

let state: GameState = loadGame() ?? newGame();

function redraw(): void {
  render(ctx!, state);
  renderUI(state, redraw);
}

initUI({
  onEndYear: () => {
    endYear(state);
    saveGame(state);
    redraw();
  },
  onNewGame: () => {
    clearSave();
    state = newGame();
    saveGame(state);
    redraw();
  },
});

attachCanvasClick(canvas, () => state, redraw);

redraw();
