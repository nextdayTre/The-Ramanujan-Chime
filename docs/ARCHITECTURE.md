# Architecture & Extension Guide

This document explains how **The Ramanujan Chime** is structured so new mathematical experiments, presets, and audio/DSP modules can be added cleanly **without HTML or CSS bloat**.

---

## 1. Core Architectural Invariants

### A. Single Source of Truth (`float32` Engine Contract)
- **All math lives in [`js/engine.js`](../js/engine.js)** (`window.Harmony.engine`, `window.Harmony.PRECISION === 'float32'`).
- Every formula evaluation (`x(t)`, `y(t)`, `z(t)`), built-in DSP primitive (`weierstrass`, `morlet`, `fourierSquare`, `cbrt`, `saw`), and twin derivation (`antipodal`, `conjugate`, `realTrace`) is rounded through `Math.fround()` so JavaScript's 64-bit `Number` behaves identically to a 32-bit audio DSP buffer (`Float32Array`).
- **No view computes its own curve math.** Every 3D and 2D renderer consumes `state.points` and `Engine.playhead(state, points, playT)`.
- **Live Cross-View Agreement (`window.__agree`):** On every animation frame, [`js/app.js`](../js/app.js) verifies that the exact `float32` coordinates rendered by the 3D Sphere (`__scene3dPoint`), 2D Slice Scope (`__lissCross`), and IEEE-754 Bit Lab (`__bitPoint`) match bit-for-bit.

### B. Zero-Scroll `100dvh` Studio Layout
To prevent vertical page creep as features grow, [`index.html`](../index.html) and [`css/styles.css`](../css/styles.css) enforce a fixed viewport studio grid:
1. **Top Header (`46px`):** Identity badge, 4-zone color legend, and global **TWIN** mode switch.
2. **Left Synth Rack (`306px`, independently scrollable if needed):** VST `A|B|C` Sphere Bank, Preset selector, Hollow Sphere Vessel controls ($R$, $r$, Order $N$), Oscillator/Harmonic sliders, and collapsible Patch Bay equations.
3. **Hero 3D Stage (`flex: 1`):** Three.js Hollow Sphere canvas with lightweight floating HUD pills and optional circular Zoom Lens overlay.
4. **Tabbed Studio Dock (`228px`):** Houses four specialized 2D instrument bays (*1 · Scopes & Slice*, *2 · Harmonics & Ramanujan*, *3 · Frobenius & Hasse*, *4 · Float32 Bit Lab*)—only the active tab renders each frame.

### C. Zero-Build `file://` Portability
- Scripts load via classic `<script defer src="...">` tags under a single `window.Harmony` namespace rather than bare ES module imports, avoiding browser `file://` CORS restrictions when opening [`index.html`](../index.html) directly from disk.

---

## 2. Module Dataflow

```mermaid
flowchart TD
    UI["Synth Rack + A/B/C Slot Bank + HUD\n(js/app.js)"] --> State["Canonical Studio State & Slot Snapshots\n(A | B | C + #patch URL Hash)"]
    Presets["Curated Patch Definitions\n(js/presets.js)"] --> State
    State --> Engine["Single Float32 & BigInt Math Core\n(js/engine.js)"]
    Engine -->|"state.points + playhead()"| Scene3D["3D Hollow Sphere + 2D z=0 Slice + Strobe\n(js/scene3d.js)"]
    Engine -->|"sampleWindow() in float32"| Mag["Circular 4x–256x Zoom Lens\n(js/magnifier2d.js)"]
    Engine -->|"state.points + ghostPoints"| Scopes["2D Slice Scope & Dual Oscilloscope\n(js/lissajous2d.js, js/timeseries.js)"]
    Engine -->|"ramanujanSeries() + partials"| Harm["Harmonic Spectrum & Ramanujan 1/π\n(js/harmonics2d.js)"]
    Engine -->|"BigInt Lucas Recurrence"| Frob["Frobenius Phasors & secp256k1 Hasse\n(js/frobenius.js)"]
    Engine -->|"DataView IEEE-754 bits"| Bits["Float32 Hex & Sign/Exp/Mantissa Lab\n(js/app.js)"]
```

---

## 3. Module Responsibilities

| File | Namespace | Responsibility |
| :--- | :--- | :--- |
| [`js/engine.js`](../js/engine.js) | `Harmony.engine` | Whitelisted formula compiler/validator, `float32` trajectory sampler (`sample`, `sampleWindow`), Hollow Sphere volume/zone metrics (`shellMetrics`, `zoneOf`), twin transforms, Four-Bit Orbit & Quadray tetrahedron solver (`fourBitOrbit`), Ramanujan $1/\pi$ series (`ramanujanSeries`), discrete cyclic group builder (`discreteGroup`), 256-bit `BigInt` `secp256k1` Frobenius engine, and `DataView` IEEE-754 bit extractor (`bitInspect`). |
| [`js/presets.js`](../js/presets.js) | `Harmony.Presets` | Pure declarative array of patches (`name`, `group`, `formulas`, `params`, `hints`, `note`). Automatically grouped into `<optgroup>` menus by `app.js`. |
| [`js/scene3d.js`](../js/scene3d.js) | `Harmony.Scene3D` | Three.js WebGL renderer: Outer Sphere $R$, Inner Cavity $r$, Cutaway cross-section, inscribed $z=0$ Cartesian $f(x)/x$ slice plane, 4-zone vertex-colored curve, Four-Bit Orbit (`1000 ↔ 0001`, `1111/F`, `0000`) & inscribed Quadray tetrahedron, Antipodal & Conjugate twins, VST Ghost reference curve, Discrete Order $N$ 3D nodes/chords, and camera presets. |
| [`js/magnifier2d.js`](../js/magnifier2d.js) | `Harmony.Magnifier2D` | Floating circular zoom callout ($4\times$–$256\times$) that re-samples `Engine.sampleWindow` in `float32` around the trough, origin, or live playhead. |
| [`js/lissajous2d.js`](../js/lissajous2d.js) | `Harmony.Lissajous2D` | 2D XY quadrature & $f(x)$ slice scope with offscreen static canvas caching, fading phosphor trail, twins, Ghost reference curve, and 2D Order $N$ strobe projection. |
| [`js/timeseries.js`](../js/timeseries.js) | `Harmony.TimeSeries` | Dual-channel $x(t)$ & $y(t)$ oscilloscope with $\pm R$ / $\pm r$ rails, twin traces, Ghost reference wave, optional `saw`/`tan` reference overlays, and playhead cursor. |
| [`js/harmonics2d.js`](../js/harmonics2d.js) | `Harmony.Harmonics2D` | Left: Harmonic partial amplitude analyzer ($k = 0..K$). Right: Ramanujan $1/\pi$ vs. Gregory-Leibniz dB error convergence against the `float32` noise floor (`-144.5 dB`). |
| [`js/frobenius.js`](../js/frobenius.js) | `Harmony.Frobenius` | Left: Conjugate Frobenius eigenvalues $\lambda^k, \bar{\lambda}^k$ on the normalized Hasse circle. Right: Normalized Hasse trace $2\cos(k\phi) \in [-2, +2]$ across $k = 1..16$. |
| [`js/views.js`](../js/views.js) | `Harmony.views` | Aggregates view modules into a single inspection surface (`Harmony.views`). |
| [`js/app.js`](../js/app.js) | `Harmony.App` | Declarative `PARAM_DEFS` slider binding, canonical `captureSnapshot` / `applySnapshot` serializer powering both **VST `A/B/C` Sphere Slots** and `#patch=` URLs, dock tab routing, keyboard shortcuts, and the 60 fps `requestAnimationFrame` orchestrator. |
| [`js/agent-core.js`](../js/agent-core.js) | `Harmony.AgentCore` | Agent layer's single source of truth (browser **and** Node): the 9 pure tool definitions + envelopes, deterministic deeplink grammar, UI-state projection, manifest and legacy `#patch=` snapshot codec. See §5. |
| [`js/agent-bridge.js`](../js/agent-bridge.js) | `window.ramanujanSphere` | Installs the in-page bridge exactly once (state getters/setters, events, `subscribe`, pure `call()`), publishes the hidden `#ramanujan-sphere-state` JSON, keeps the URL in sync and fills the fifth **Agent** dock tab. |
| [`agent/cli.mjs`](../agent/cli.mjs), [`agent/mcp-server.mjs`](../agent/mcp-server.mjs), [`agent/selftest.mjs`](../agent/selftest.mjs) | — | Zero-dependency headless transports (JSON CLI, MCP stdio server, CLI+MCP self-test) that load `js/agent-core.js` through `require()`. |
| [`scripts/gen-agent-artifacts.mjs`](../scripts/gen-agent-artifacts.mjs) | — | Deterministic generator for [`agent/manifest.json`](../agent/manifest.json) and `agent/examples/*`; `--check` is the drift gate. |

---

## 4. Extending the Instrument Without Bloat

### Recipe 1: Add a New Patch Preset (Zero HTML/CSS edits)
Append an entry to `PRESETS` in [`js/presets.js`](../js/presets.js):
```javascript
{
  name: 'My New Harmonic Patch',
  group: '3D Wavelets & Knots', // Reuses existing <optgroup> or creates a new one automatically
  formulas: {
    x: 'r*cos(TAU*n*t)',
    y: 'r*sin(TAU*m*t+phase)',
    z: 'rIn*sin(TAU*k*t)'
  },
  params: { r: 1.2, rIn: 0.5, amp: 1, f: 1, n: 5, m: 3, k: 2, K: 6, orderN: 23, a: 0.5, b: 3, phaseDeg: 0 },
  hints: { sliceGrid: false, cutaway: true, magnifier: false, twinMode: 'conjugate', strobeN: false },
  note: 'Short description shown in the green Patch Note readout.'
}
```
Both the dropdown, double-click slider defaults, URL `#patch` sharing, and `A/B/C` slots support it automatically.

### Recipe 2: Add a New Math / DSP Function to the Formula Patch Bay
In [`js/engine.js`](../js/engine.js):
1. Implement the `float32`-rounded function (round inputs/outputs through `Math.fround()`); keep it pure and dependency-free.
2. Register it in the two parallel tables in `js/engine.js`: the identifier string in `PARAMS` and the implementation in `FNS`, in the **same order** (they are applied positionally by `paramsFor()`).
3. It is then available inside every user formula `x(t)`, `y(t)`, `z(t)` in the Patch Bay, and — because the agents' `analyze_patch` / `eval_point` tools call the same `Engine.sample` / `Engine.point` — automatically inside the headless CLI/MCP too.
4. Add a known-vector assertion to `tests/core.test.mjs` so the value cannot drift.

### Recipe 3: Add Real-Time WebAudio Synthesis (Future Roadmap)
Because `Harmony.engine` already evaluates bounded `float32` quadrature trajectories `(x(t), y(t), z(t))`:
- Create a standalone `js/audio.js` (`Harmony.Audio`) module with an `AudioWorklet` or stereo `ScriptProcessor` / wavetable `PeriodicWave` builder.
- Map `x(t)` → Left (`cos` I-channel) and `y(t)` → Right (`sin` Q-channel) for true stereo quadrature / Lissajous vector synthesis, clipped softly at outer sphere radius $R$.
- Wire a single mute/unmute transport pill in `.hud-right` without altering any existing panel geometry.

### Recipe 4: Migrating to TypeScript / Vite Later (Optional)
If the project ever outgrows classic `<script>` tags:
- Each IIFE in `js/*.js` already has a 1-to-1 module boundary with explicit inputs (`state`, `points`, `playT`).
- Replace `window.Harmony.X = ...` with `export const X = ...` while keeping `engine.ts` pure and dependency-free.

### Recipe 5: Add a Pure Agent Tool (all four surfaces update themselves)
The agent layer is a **contract-first** additive wrapper ([`docs/AGENT-INTERFACE.md`](./AGENT-INTERFACE.md)); adding a tool does not touch the rendering code.
1. In [`js/agent-core.js`](../js/agent-core.js), append one `ToolDef` to `TOOLS` (canonical registry order): `{ name, title, description, scope: 'pure', inputSchema, examples, run(args) }`. `run` may throw an `AgentToolError(code, message, hint)` for bad input; `callTool` converts it into the standard failure envelope and never throws. Put any new maths in `js/engine.js`, never in the tool.
2. Reuse the shared helpers: `resolvePatchArgs(args)` (validated patch selector), `Engine.*`, `deeplinkForState(state)` for an envelope link, or `bitInspect`-style pure data.
3. Add known-vector + envelope tests to `tests/registry.test.mjs` (and `tests/deeplink.test.mjs` if the tool emits a deeplink).
4. Regenerate the machine artifacts: `node scripts/gen-agent-artifacts.mjs` (adds `agent/examples/<tool>.json`), then `node scripts/gen-agent-artifacts.mjs --check` must exit 0.
5. Document it in `docs/AGENT-INTERFACE.md` §2, `AGENTS.md` and `llms.txt`, then run the acceptance battery (`node --test`, `node agent/selftest.mjs`, `node agent/verify-static.mjs`).
The bridge's `tools()`/`call()`, the CLI command, the MCP `tools/list`/`tools/call`, the manifest and the examples all derive from the one `TOOLS` array — no transport edits.

---

## 5. Agent Layer (additive)

The instrument is also an **agent-operable tool**. Nothing in the maths or rendering changed: `js/engine.js` remains the one engine, and the agent layer wraps it. Three independent surfaces share one contract and one implementation:

```
                       ┌──────────────────────────── js/agent-core.js ────────────────────────────┐
                       │ TOOLS / callTool / getManifest / deeplink grammar / projectUiState       │
                       └───────┬─────────────────────┬───────────────────────┬──────────────────────┘
    browser page ◄─────────────┤                     │                       ├────────────► Node
    js/app.js + js/agent-bridge.js                    │                       │             agent/cli.mjs
    (deeplinks + hidden #ramanujan-sphere-state JSON, │                       │             agent/mcp-server.mjs
     window.ramanujanSphere setters/events/subscribe) │                       │             (--json envelopes,
                                                       │                       │              JSON-RPC 2.0 stdio)
                                            scripts/gen-agent-artifacts.mjs ──┘
                                            agent/manifest.json + agent/examples/*
```

- **Surface 1 — deeplinks + state:** the page parses the query on mount, applies it, publishes the compact UI-state object into the hidden `<pre id="ramanujan-sphere-state">` and keeps the URL in sync (debounced `history.replaceState`). `?static=1` freezes transport/orbit, making the link pixel-reproducible.
- **Surface 2 — bridge:** `window.ramanujanSphere` (installed once by `js/agent-bridge.js` after the app boots) exposes `getState`, `setState`, `setTab`, `setClock`, `step`, `play`/`pause`/`reset`, pure `call`, `getDeeplink`, `subscribe`, `tools`, `getManifest`. Setters never throw; a no-op setter emits no change event.
- **Surface 3 — headless:** `agent/cli.mjs` (`--json`, exit 0/2/3/4) and `agent/mcp-server.mjs` (newline-delimited JSON-RPC 2.0) load the same `js/agent-core.js` through `require()`; `node agent/selftest.mjs` proves CLI == MCP == registry.

Rules for this layer (mirrored in `AGENTS.md` §8):

1. **One implementation** — `js/engine.js` (maths) + `js/agent-core.js` (tools/state/links). Never copy a formula or a state projection into a transport.
2. **Deterministic output** — no timestamps, randomness or locale formatting; identical input ⇒ byte-identical JSON (`--check` enforces it for the committed artifacts).
3. **Pure tools are read-only** — only bridge setters change what the user sees.
4. **Additive** — the only visible change to the default view is the fifth `5 · Agent` dock tab.
5. **Generated files are generated** — edit the registry/generator, then re-run it (`agent/manifest.json`, `agent/examples/*` must never be hand-edited).

Machine-readable companions: [`AGENTS.md`](../AGENTS.md) (LLM onboarding), [`llms.txt`](../llms.txt) (short index), [`agent/manifest.json`](../agent/manifest.json) (tool catalogue + deeplink defaults + UI selectors), [`docs/ECOSYSTEM-MAP.md`](./ECOSYSTEM-MAP.md) (honest cross-tool map, planned handoffs), and `docs/AGENT-SCREENSHOTS.md` (reproducible capture recipe).
