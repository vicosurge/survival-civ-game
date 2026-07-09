# Asset Pipeline

How art, audio, and voice get from a creator's tools into the game — where files live, what formats, how they're named, and how they wire into the build. Read this before adding any asset. The **art style guide** (see the Production Roadmap) governs the *look*; this doc governs the *plumbing*.

## Principle: only finals go in the repo

The Git repository holds **finished, optimized, shipping assets only**. Editable source files bloat the repo permanently (every version is kept forever) and don't belong in the build.

| Keep **in the repo** | Keep **off the repo** (shared drive) |
|---|---|
| Exported PNG sprites, tiles, icons | `.aseprite`, `.psd`, layered source |
| Final `.mp3` music and SFX | `.wav` masters, DAW project files |
| Final text/writing | Scratch drafts, reference boards |

If you need a home for source files, use the project's shared drive (linked from Confluence), not the repo. When in doubt, ask before committing a binary.

> **Long-term note:** we're keeping sprites **bundled** (see below) for now because it's the simplest path for everyone. As the asset count grows this will add friction, and we'll likely gate `main` behind pull requests / branch protection and possibly add a lighter submission path for non-engineers. Not a blocker today — flagged so the direction is known.

## Where files live

Two homes, chosen by how the file is loaded:

### `src/assets/` — bundled (sprites, tiles, icons)

Small, versioned visual assets go here and are **imported** so Vite bundles and content-hashes them (automatic cache-busting on change). This is our main target.

```
src/assets/
  tiles/        terrain + tile-state art (grass, forest, stone, beach, river, worked/fallow/exhausted…)
  buildings/    one sprite per building
  icons/        resource + job + UI icons
```

### `public/` — served as-is (audio, large/streamed files)

Files here are copied verbatim to the site root and referenced by known path (`/music/…`, `/sfx/…`). Good for audio, which streams and should fail silently if missing. Music already lives here.

```
public/
  music/        background loops (the current placeholder lives here)
  sfx/          short sound effects
```

## Naming conventions

Kebab-case, category-prefixed, and **mirroring the ids already in `src/types.ts`** (building ids, terrain types, job ids) so a creator can name a file correctly without reading code.

| Category | Pattern | Example |
|---|---|---|
| Tile / terrain | `tile-<terrain>[-<state>].png` | `tile-grass-worked.png` |
| Building | `building-<id>.png` | `building-granary.png` |
| Icon | `icon-<thing>.png` | `icon-food.png` |
| SFX | `sfx-<event>.mp3` | `sfx-build-complete.mp3` |
| Music | `music-<name>.mp3` | `music-main-theme.mp3` |

## Formats & resolution

- **Sprites/icons:** PNG (lossless, alpha). No JPG for art.
- **Audio:** MP3 (broad browser support). Keep loops short; the game loops one track per session.
- **Base resolution:** the map grid is **`TILE_SIZE = 32`px** (`src/types.ts`). Author tile/building art on a 32px grid and scale by **integer factors only** — no fractional scaling, it muddies pixel art. Multi-tile structures are multiples of 32. The style guide sets the authoring scale (e.g. 1× vs 2× source); until it lands, target 32px tiles.

## How assets wire into the build

A single registry maps stable ids to imported files, and a loader preloads them before first render:

- **`src/assets.ts`** (to be added with the first real sprite) — imports each bundled asset and exposes it by id (`building-granary` → the imported URL/Image).
- The renderer looks assets up by id and **falls back to the current procedural drawing if an asset is missing or not yet loaded.** This mirrors how music already fails silently, and it's the key to landing art *incrementally* — no big-bang swap, the game always runs.
- Audio in `public/` is referenced by path (the `<audio>` element in `index.html` for music; a small play helper for SFX).

Keep the registry the single source of truth — the renderer should never hardcode a file path.

## Every asset gets a credit

When you add an asset, add a row to **`CREDITS.md`** with the creator and the license it ships under, in the same pull request. Placeholder assets (like the current music loop) are flagged there as release blockers until cleared or replaced.

## Checklist for adding an asset

1. Export the **final** file (PNG or MP3) at the right resolution/format.
2. Drop it in the correct folder with a conforming name.
3. Register it in `src/assets.ts` (visual) or reference its `public/` path (audio).
4. Confirm the game still runs and the asset (or its procedural fallback) renders.
5. Add your `CREDITS.md` row.
6. Open a pull request — don't push assets straight to `main`.
