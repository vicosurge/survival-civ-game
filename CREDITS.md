# Credits & Licensing

Isle of Cambrera is a collaborative project. This file records who made what, and under which license each part ships. **If you contribute, add yourself here in the same PR.**

## Licensing at a glance

The project has two kinds of material, and they are **not** necessarily under the same license:

- **Code** — licensed under the **GNU General Public License v2** (see `LICENSE`). All source in `src/`, `feedback-worker/`, build config, and scripts.
- **Creative assets** — art, music, sound effects, and voice recordings. Each asset is credited below with its own license. Original assets are licensed by their creator; contributors retain authorship credit. Do not add third-party assets without confirming their license permits use and redistribution here.

If you're unsure which bucket your contribution falls in, ask before merging.

## Contributors

| Name | Discipline | Notes |
|---|---|---|
| Vicente Muñoz | Design, direction, engineering, writing/lore | Creator and lead |
| _(open)_ | Art & visual | See roadmap — art style guide comes first |
| _(open)_ | Music & sound | Original theme + SFX needed |
| _(open)_ | Voice acting | Scoped to intro/departure narration initially |
| _(open)_ | QA & playtesting | Alpha testers credited on request |

_"(open)" roles are unfilled — credit is assigned to whoever the work corresponds to as contributors come aboard._

## Assets

| Asset | Type | Creator | License | Status |
|---|---|---|---|---|
| Terrain / tile / building visuals | Art | Vicente Muñoz | GPL v2 (procedural, in code) | **Placeholder** — procedurally rendered on Canvas; original art pending the style guide |
| `public/music/gemini_iron_under_snow.mp3` | Music | AI-generated (working title) | **To be confirmed** | **Placeholder** — to be replaced by an original main theme; verify usage terms before any public release |
| Sound effects | Audio | — | — | **Not yet created** |
| Voice-over | Audio | — | — | **Not yet created** |

**Placeholder assets must be cleared or replaced before a public/v1.0 release.** Anything whose license is "to be confirmed" is a release blocker until resolved.

## How to add yourself

1. Add a row to **Contributors** with your name and discipline.
2. For each asset you deliver, add a row to **Assets** with the creator, the license it ships under, and its status.
3. Keep placeholder entries honest — mark clearly what still needs replacing or clearing.

## Third-party dependencies

Build and runtime dependencies (TypeScript, Vite, and their transitive packages) are licensed under their respective terms — see `package.json` / `package-lock.json` and each package's license. The game bundles no third-party runtime library into the shipped code beyond what the build toolchain requires.
