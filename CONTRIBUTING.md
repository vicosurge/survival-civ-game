# Contributing to Isle of Cambrera

Welcome. Cambrera began as a solo project and is opening up to a small team — artists, musicians, voice talent, engineers, and testers. This is your start-here guide. The high-level pitch and the discipline roadmap live in the project's Confluence space; this file is the practical, repo-side onboarding.

> **Play the current build:** https://cambrera.digimente.xyz
> **Active work:** https://github.com/users/vicosurge/projects/1

## Read these first, in this order

1. **`README.md`** — what the game is, the stack, local setup, project structure.
2. **`CLAUDE.md`** — the authoritative, current-state design and mechanics reference. If a number or rule is anywhere, it's explained here. Read the section relevant to what you're touching before you touch it.
3. **The lore bible** (`memory/project_cambrera_lore.md`) — canonical names, places, and factions (Cambrera, the Exarum war, Captain Amezcua, the goddess Anata). Read it before writing any event, flavor, or hostile.

## Getting set up

Requires **Node ≥ 18**.

```bash
git clone git@github.com:vicosurge/survival-civ-game.git
cd survival-civ-game
npm install
npm run dev        # Vite dev server at http://localhost:5173 with hot reload
```

Other commands:

```bash
npm run build      # type-check (tsc --noEmit) + production bundle to dist/
npm run preview    # serve the production bundle locally
npx tsc --noEmit   # type-check only
```

The `dist/` folder is static files and can be dropped on any host.

## How we work

- **Work is tracked on the GitHub project board.** Pick something from there or open an issue first for anything non-trivial.
- **Branch off `main`.** Don't commit game changes straight to `main`.
- **Commit messages** for releases follow `vX.Y: short summary` — the deployed build auto-rebuilds from pushes to `main`. Keep the canonical version in `src/types.ts` (`VERSION`) as the source of truth.
- **Open a pull request** for review. Keep PRs focused — one concern each.
- **Type-check before you push** (`npx tsc --noEmit`); the project is strict mode with no unused locals/params.

## The rules that will save you

These are load-bearing design and safety decisions. Breaking one silently will cost a reviewer a lot of time — if you think one is wrong, open a discussion first, don't just change it.

- **Baseline farming is break-even on purpose.** Don't bump base farmer yield — "good land is a real resource" depends on it. Same spirit: don't add passive morale drain, and don't add new growth/build/trade gates without a design conversation.
- **Bump `SAVE_KEY` on any breaking save-shape change**, and make old saves fail loud → `newGame()`. Never let a stale save load into NaN/undefined.
- **Keep docs in lockstep with code.** A mechanic change and its updates to `CLAUDE.md`, `README.md`, and `src/help.ts` ship in the *same* change. Out-of-date help is worse than none — it's part of the player contract.
- **No game engine, no UI framework** unless the complexity genuinely demands it (React is the fallback if UI gets gnarly). Don't reach for Phaser/Pixi/Godot.
- **Browser-first.** Mobile comes later via a Capacitor wrapper — don't rewrite for it.
- **Comments explain WHY, not WHAT.** Match the density and idiom of the surrounding code.
- **Respect the staged-complexity arc:** early = resources/exploration, mid = combat, late = diplomacy. Don't skip ahead.

## Contributing art, music, or voice

The creative disciplines are the biggest open frontier — see the **Production Roadmap** in Confluence for what's needed and in what order (the art style guide comes first). When you contribute an asset:

- Match the tone: **low fantasy, medieval → renaissance, magic fading**, and the retro 2000s browser-game feel.
- Add yourself and your work to **`CREDITS.md`**, with the license your asset ships under.
- Follow **[`docs/ASSET_PIPELINE.md`](docs/ASSET_PIPELINE.md)** — where files live, naming, formats, and how they wire into the build. **Only finished assets go in the repo**; source files (`.aseprite`, `.wav`, DAW projects) live on the shared drive. Ask before dropping large binaries in.

## Reporting bugs and feedback

- In-game: the **Leave Feedback** button (players) and **Export Chronicle** (a full run log for repro).
- For contributors: open an issue with steps to reproduce and, where relevant, an attached chronicle export.

## License

The code is licensed under the **GNU GPL v2** — see `LICENSE`. Creative assets may carry their own licenses; see `CREDITS.md`. By contributing, you agree your contribution is licensed under the same terms as the part of the project it belongs to.
