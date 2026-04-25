# Isle of Cambrera

A single-player, turn-based 2D browser game about founding a settlement on a fantasy island and growing it toward a kingdom. Inspired by the 1968 *Hamurabi* BASIC game (allocate-and-consequences), *Civilization* (build-a-civ arc), *Lords of the Realm II* (seasonal pacing — planned for later), and *Master of Orion* (every patch of land matters, even the poor ones).

The world is low-fantasy: classical creatures exist but magic is fading, and the technological arc runs medieval → renaissance.

- **Play it:** [cambrera.digimente.xyz](https://cambrera.digimente.xyz)
- **Roadmap + active work:** [project board](https://github.com/users/vicosurge/projects/1)
- **Version history:** [GitHub releases](https://github.com/vicosurge/survival-civ-game/releases) · [git log](https://github.com/vicosurge/survival-civ-game/commits/main)

## What it plays like

You land on a small northern island as refugees fleeing a continent-destroying war. Each turn is one year. You allocate a handful of workers across farming, hunting, fishing, woodcutting, quarrying, and scouting; buildings (granary, palisade, well, hunting lodge, long house, shrine of Anata) give your resource surplus somewhere to go and counter specific threats; private houses lift the population cap once the long house stands; your rescue ship can voyage out for two years to bring back survivors. Pops age through child / adult / elder phases, fertile tiles matter, morale gates growth, and a chronicle of the years accumulates on the right. There is no hard win condition — the soft goal is becoming a kingdom.

## Playing locally

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`. Requires Node ≥ 18.

## Building for deployment

```bash
npm run build     # type-check + production bundle to dist/
npm run preview   # serve the production bundle locally
```

The `dist/` folder is static files — drop it on any host (GitHub Pages, Netlify, Vercel, a plain S3 bucket).

## Stack

- **TypeScript** (strict mode)
- **Vite** for dev server and bundling
- **HTML Canvas** for map rendering
- **DOM overlay** for UI panels (resource bar, allocator, tile info, chronicle log)
- **localStorage** for saves

No game engine — a turn-based tile game doesn't need the weight. React can layer in later if the UI gets gnarly.

## Project structure

```
index.html            canvas + sidebar shell (allocator, tile info, log)
src/
  main.ts             entry point, wires everything
  types.ts            shared types and tuning constants
  map.ts              hand-crafted island, capacity generation, reach/eligibility
  state.ts            newGame / save / load / allocation summaries
  events.ts           random events table + roller
  turn.ts             end-year resolution pipeline
  render.ts           canvas renderer
  ui.ts               DOM overlay (topbar, allocator, tile info, log, overlays)
  style.css           retro-inspired palette (muted browns, gold accents)
```
