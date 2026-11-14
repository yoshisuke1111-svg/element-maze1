# Strong engine and source licenses

Kido's high-strength mode integrates **Fairy-Stockfish**, from the official package `fairy-stockfish-nnue.wasm@1.1.12`, distributed under the GNU GPL-3.0 license. The program is hosted in `shogi-v04/engine/`. Its license text (`Copying.txt`), authors and package metadata are distributed alongside the unmodified binaries.

- Upstream source code: https://github.com/fairy-stockfish/fairy-stockfish.wasm
- Original Fairy-Stockfish project: https://github.com/fairy-stockfish/Fairy-Stockfish
- Reproducible binary acquisition script: `.github/workflows/shogi-engine-assets.yml`
- USI Shogi engine test: `shogi-v04/test-engine.cjs`
- Browser smoke test: `shogi-v04/test-browser.cjs`

The site uses `coi-serviceworker.min.js` by Guido Zuidhof and contributors, licensed MIT (copyright banner retained): https://github.com/gzuidhof/coi-serviceworker

The engine is loaded locally from the same origin. For unsupported or non-isolated browsers, the application falls back to the original light JavaScript CPU and tells players which AI is currently active.

**Skill caveat:** This integration was tested for legal USI Shogi move generation, but has not been independently measured against Piyo Shogi level 30. A fixed rating such as "30 equivalent" would be unsupported until controlled match results are available.
