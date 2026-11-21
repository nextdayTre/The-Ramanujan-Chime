# AGENTS.md — Ramanujan's Gift

> **Read this first, then [`docs/AGENT-INTERFACE.md`](docs/AGENT-INTERFACE.md).** This file gets
> a fresh LLM from zero to driving the instrument; the contract file is the normative spec
> (envelope, error codes, deeplink grammar, UI state schema, bridge, CLI, MCP, acceptance).

| | |
|---|---|
| Tool id | `ramanujan-sphere` |
| Title | Ramanujan's Gift |
| Versions | toolset `1.0.0` · `schemaVersion` 1 |
| App URL | `http://127.0.0.1:8080/` |
| Bridge | `window.ramanujanSphere` |
| Hidden state | `<pre id="ramanujan-sphere-state" data-schema-version="1" hidden>` |
| Ready marker | `document.body[data-agent-ready="true"]` |
| Preconditions | A modern browser; Node.js for the CLI/MCP (developed and verified on `v24.14.1`). No build step, no `npm install`, no network. |

---

## 1. What this is

Ramanujan's Gift is a **zero-build, single-page 3D spatial-synth
visualiser and IEEE-754 `float32` mathematics laboratory**: a constant hollow-sphere vessel
`V = 4/3·π(R³ − r³)` carries quadrature trajectories `(x(t), y(t), z(t))`, Four-Bit Orbit
palindromes, Morlet wavelets, Weierstrass fractals, Lissajous knots and finite-field
`secp256k1` structures. The page renders the maths but never computes it — all formulas and
derived values come from one classic script, `js/engine.js`, which is shared verbatim with
Node. The agent layer (this document's subject) is **additive**: it exposes the existing
instrument through deeplinks, an in-page bridge, a JSON CLI and an MCP stdio server, plus a
fifth **`Agent`** dock tab for humans. It never changes the maths, the rendering or the
default view.

What an agent can do without touching pixels:

- reproduce and inspect any rendered state from a URL (deeplinks + static state JSON),
- drive the live page synchronously (`window.ramanujanSphere`),
- evaluate nine pure, read-only tools headlessly (`node agent/cli.mjs … --json`),
- expose the same tools to an MCP client (`node agent/mcp-server.mjs`).

Everything below is copy-paste runnable from the repository root
`C:\Users\trevor\Documents\Ramanujan Sphere`.

---

## 2. Quick start

### 2.1 Served mode (recommended)

```powershell
cd "C:\Users\trevor\Documents\Ramanujan Sphere"
python -m http.server 8080 --bind 127.0.0.1
# open http://127.0.0.1:8080/
```

Served mode gives you the full contract: clipboard-friendly Agent tab, `fetch` of
`agent/manifest.json`, clean deeplink URL sync via `history.replaceState`, and the served
generated artifacts. Any static file server rooted at the repository works; the documented
commands assume `http://127.0.0.1:8080/` as the base.

### 2.2 `file://` mode (works, with caveats)

Double-click `index.html`, or open
`file:///C:/Users/trevor/Documents/Ramanujan%20Sphere/index.html`. No server is required to
render the instrument and **deeplinks still parse**: `index.html?preset=5&static=1` applies
preset 5. The caveats are platform rules, not tool bugs:

- **URL sync is best-effort.** `history.replaceState` is wrapped in a `try`; when the browser
  refuses it on `file://`, the address bar simply does not update. Read the authoritative
  link with `window.ramanujanSphere.getDeeplink()` instead.
- **`fetch()` is blocked.** A page opened from `file://` cannot `fetch('agent/manifest.json')`
  (opaque origin). Use the CLI/MCP (they read the same files from Node), or serve the folder.
- **Clipboard may be denied.** The Agent tab's copy buttons fall back to showing plain text;
  the deeplink and state are always available programmatically (`getDeeplink()`, `getState()`).

### 2.3 First moves

```powershell
# Discover everything without a browser (offline, deterministic):
node agent/cli.mjs manifest --json

# Regenerate/verify the committed static artifacts:
node scripts/gen-agent-artifacts.mjs --check

# Full transport self-test (CLI + MCP + canonical vectors):
node agent/selftest.mjs
```

In the browser console on the served page:

```js
window.ramanujanSphere.ready                    // true once installed
window.ramanujanSphere.getState()               // full UI-state object (contract §5)
window.ramanujanSphere.tools().map(t => t.name) // the nine tool names, canonical order
```

---

## 3. Mental model

### 3.1 One page, one state, one maths core

```
js/engine.js        float32 + BigInt maths        ← single source of truth (browser AND Node)
js/presets.js       declarative patch presets     ← shared catalogue
js/agent-core.js    tool registry, envelopes, deeplinks, UI-state projection
      │
      ├── index.html + js/app.js + js/agent-bridge.js   → the page, URL sync, window.ramanujanSphere
      ├── agent/cli.mjs                                 → `--json` transport
      ├── agent/mcp-server.mjs                          → MCP stdio transport
      └── scripts/gen-agent-artifacts.mjs               → agent/manifest.json + agent/examples/*

js/scene3d.js, lissajous2d.js, timeseries.js, harmonics2d.js, frobenius.js, magnifier2d.js
      → renderers; they consume state.points / Engine.playhead, never compute maths
```

- **`js/engine.js`** (`window.Harmony.engine`, also `module.exports` for Node) owns every
  formula evaluation, `Math.fround` rounding, twin derivation, shell metrics, bit inspection,
  the Ramanujan series, the discrete-group builder and the `BigInt` `secp256k1` Frobenius
  engine. If a formula is missing, add it there — both browser and Node inherit it.
- **`js/agent-core.js`** (`window.Harmony.AgentCore` / `require`) turns engine primitives into
  deterministic tool envelopes, state projections and deeplinks. It is the only module all
  four surfaces share.
- **The page** parses the query on mount, applies it, publishes the UI-state object to the
  hidden `<pre>` and to the bridge, and keeps the URL in sync (debounced ~300 ms).

Dock tabs (state field `tab`): `scopes` · `harmonics` · `frobenius` · `bits` · `agent`
(the fifth tab is the only visible UX addition of the agent layer). The dock grows to
**344px only while the Agent tab is active** (`body[data-agent-active-tab="agent"]`); the
four original tabs keep their 228px dock and unchanged layout.

### 3.2 Everything is `float32`

The engine rounds through `Math.fround()` so a 64-bit JS `Number` behaves like a 32-bit audio
DSP buffer. Consequences worth knowing:

- π is `float32` `3.14159274` = hex **`0x40490FDB`** (24 significand bits, ≈144.5 dB).
- The **Float32 Bit Lab** tab (`bits`) shows sign / exponent / mantissa for the current point;
  the pure tool `bit_inspect` returns the identical numbers headlessly.
- `window.__agree` on every animation frame asserts that the 3D sphere, 2D scope and Bit Lab
  render the same `float32` coordinates (baseline invariant; must stay `true`).

### 3.3 The hollow-sphere vessel

`R` (outer carrier) bounds quadrature oscillators; `r` (inner cavity) is a nested core; the
shell is the annulus between them:

```
V_shell = 4/3·π(R³ − r³)     (Engine.shellMetrics → volOuter, volCavity, volShell)
```

Every sampled point is classified by `Engine.zoneOf` as `ON SPHERE`, `IN SHELL`, `IN CAVITY`
or `OUTSIDE` (e.g. a `tan()` sentinel escaping past `R`). `analyze_patch` reports these as
`zoneCounts` plus per-axis extents, and `eval_point` reports the visible telemetry strings.

### 3.4 The Four-Bit Orbit (`1000 ↔ 0001`) and the Quadray tetrahedron

The signature patch is preset index **12** (`Four-Bit Orbit — 1000 (8) ↔ 0001 (1) Palindrome
& Quadray`, the default preset):

- `1000₂` (8) and `0001₂` (1) are an antipodal palindrome pair orbiting on the shared
  **X-axis intersection** of the Front `f(x)` meridian (`z = 0`) and the Top `XZ` equator.
- The vertical elevation maps to a 4-bit nibble: `1111` (`0xF`, 15) at the top pole down to
  `0000` (0) at the bottom; at `playT = 0` the nibble is `1000` (`0x8`). See the deeplink
  `pt` parameter and the rendered nibble card.
- Inscribed in the sphere is the regular **Quadray tetrahedron** with IVM basis labels
  `(1,0,0,0)` (`1000`), `(0,1,0,0)` (`0100`), `(0,0,1,0)` (`0010`), `(0,0,0,1)` (`0001`).
  The pure tool `fourbit_orbit` returns all four vertices (`quadray`) as `float32` `xyz`
  points plus their bit labels; `docs/ECOSYSTEM-MAP.md` explains how they relate (and do not
  yet relate) to the sibling quadray tools.

### 3.5 Twin modes

The TWIN selector separates two symmetries engineers routinely conflate:

| mode | transform | role |
|---|---|---|
| `off` | none | single trace |
| `antipodal` | `−P = (−x, −y, −z)` | 180° polarity flip / phase-null test: `P + (−P) = 0` |
| `conjugate` | `P̄ = (x, −y, z)` | negates the quadrature axis; `P + P̄` collapses to the Real Trace (Euler, Morlet, elliptic point negation) |
| `both` | both traces | default for several presets |

`setState({ twin: 'conjugate' })`, the deeplink param `twin=conjugate`, and the `twin` field
in `eval_point` all address the same setting.

### 3.6 State is derived, never scraped

The UI-state object (contract §5) has fixed top-level keys:
`schemaVersion, ready, tool, preset, tab, slot, inputs, formulas, toggles, twinMode,
bitSource, magnifier, transport, derived, deeplink, bridge`. `derived` contains exactly what
the visible panels show (`shell`, `playhead`, `fourbit`, `readout`), recomputed by the shared
engine — never parsed from DOM text. Read it from any of:

- `window.ramanujanSphere.getState()`,
- `document.querySelector('#ramanujan-sphere-state').textContent` (JSON),
- `node agent/cli.mjs state --json` (composed headlessly by the same core).

---

## 4. Surface 1 — deeplinks + machine-readable state

A URL reproduces the exact rendered view. The canonical emitter order is fixed:

```
preset, tab, static, anim, orbit, pt,
r, rIn, amp, f, K, orderN, a, b, n, m, k, phase,
twin, bit, mz, mf,
cut, slice, strobe, fourbit, quadray, mag, ghost, ref,
surf, wire, grid, axes, rvec, rtrace,
fx, fy, fz
```

Key rules (`docs/AGENT-INTERFACE.md` §4 is normative):

- **Delta encoding.** Only values that differ from the base state are emitted. The default
  view is just `http://127.0.0.1:8080/`.
- **Parsing is tolerant** — unknown params are ignored, invalid enums/numbers fall back,
  a deeplink never crashes the page. Precedence: `preset` first, explicit params override.
- **No history entries** — sync uses debounced `history.replaceState`; a legacy
  `#patch=…` hash disables URL sync (Share-Link mode).
- `pt=<0..1>` pins the playhead (implies `anim=0`); `static=1` freezes transport and
  auto-rotate; `anim=0/1`, `orbit=0/1` toggle animation and camera orbit.
- `twin=off|antipodal|conjugate|both`, `bit=auto|main|ramanujan`, `mz=4|16|64|256`,
  `mf=playhead|origin|trough`, `tab=scopes|harmonics|frobenius|bits|agent`.
- `fx/fy/fz` are URI-encoded formula strings; the remaining parameters are the numeric
  inputs and boolean toggles listed in §2 of the contract.

### 4.1 Copy-paste examples

```text
http://127.0.0.1:8080/                                      # default: preset 12, scopes tab
http://127.0.0.1:8080/?tab=bits&static=1                    # Float32 Bit Lab, frozen frame
http://127.0.0.1:8080/?preset=4&static=1                    # Morlet Ψ(x) — 2D Gabor slice
http://127.0.0.1:8080/?preset=5&static=1                    # Analytic Morlet ψ(t) — 3D helix
http://127.0.0.1:8080/?preset=12&tab=harmonics&static=1     # Ramanujan spectrum view
http://127.0.0.1:8080/?preset=12&twin=conjugate&static=1    # conjugate twin / real trace
http://127.0.0.1:8080/?preset=12&pt=0.25&static=1           # playhead pinned at t=0.25
http://127.0.0.1:8080/?preset=12&r=1.2&rIn=0.6&static=1     # resized vessel
```

Build canonical links instead of hand-writing them:

```powershell
node agent/cli.mjs build_deeplink --tab bits --static --json
node agent/cli.mjs build_deeplink --preset 5 --tab harmonics --static --json
node agent/cli.mjs build_deeplink --preset 12 --pt 0.25 --static --base http://127.0.0.1:8080/ --json
```

The `data.query` object is the emitted-parameter map; the envelope's `deeplink` field is the
URL. `build_deeplink` accepts the shared patch selector plus the **view arguments** too: the
enums `twin`, `bit`, `mz`, `mf`, the boolean toggle params
(`cut, slice, strobe, fourbit, quadray, mag, ghost, ref, surf, wire, grid, axes, rvec, rtrace`)
and the `fx`/`fy`/`fz` formula strings. From the CLI that means:

```powershell
node agent/cli.mjs build_deeplink --preset 12 --twin conjugate --static --json
node agent/cli.mjs build_deeplink --r 1.2 --phase 45 --json
node agent/cli.mjs build_deeplink --bit main --mz 64 --mf playhead --json
node agent/cli.mjs build_deeplink --cut 1 --quadray 0 --json
node agent/cli.mjs build_deeplink --x "r*cos(TAU*t)" --y "r*sin(TAU*t)" --json
node agent/cli.mjs build_deeplink --args '{"quadray":false,"cut":true,"fx":"r*cos(TAU*t)"}' --json
```

### 4.2 The screenshot contract (`?static`)

`static=1` freezes animation and camera orbit, so **the same link always produces the same
state and the same pixels**. Two independent reads must agree byte-for-byte:

```js
// in the page (static mode)
JSON.parse(document.querySelector('#ramanujan-sphere-state').textContent)
// deep-equals
window.ramanujanSphere.getState()
```

In animate mode the clock advances between reads by design; use `static=1` (or
`setClock()`/`pause()`) whenever you compare or screenshot. The hidden state element is
always mounted on every tab and is refreshed on every publish.

A deeplink also survives being re-emitted: `getDeeplink()` returns the current state's URL;
opening it twice must produce identical state. That is the reproducible-screenshot workflow
(see [`docs/AGENT-SCREENSHOTS.md`](docs/AGENT-SCREENSHOTS.md) for the committed reference
images and the exact harness, and the acceptance commands in §9 for the automated browser
check).

### 4.3 Reading state without a driver

```powershell
# Deterministic single-frame render of the current state, no browser driver needed:
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu `
  --no-first-run --no-default-browser-check `
  --user-data-dir="$env:TEMP\rs-chrome-$(Get-Random)" `
  --virtual-time-budget=4000 --dump-dom `
  "http://127.0.0.1:8080/?tab=bits&static=1" | Select-String 'ramanujan-sphere-state|data-agent-ready'
```

The page's own automation hooks (§6) exist for CDP/Playwright/Puppeteer agents; plain
`--dump-dom` already exposes the readiness marker and the hidden JSON because they are in the
DOM.

---

## 5. Surface 2 — the in-page bridge (`window.ramanujanSphere`)

Installed once by `js/agent-bridge.js` after the app boots. The full object:

```js
window.ramanujanSphere = {
  toolId: 'ramanujan-sphere', schemaVersion: 1, version: '1.0.0', ready: true,
  getManifest(), tools(),          // tools(): ToolDefs without run
  getState(),                      // contract §5, fresh object each call
  setState(patch),                 // -> {ok:true,state,warnings} | {ok:false,error,state}
  setTab(tab), setClock(t), step(delta), play(), pause(), reset(),
  call(name, args),                // envelope from the shared registry
  getDeeplink(),                   // absolute current URL
  subscribe(fn),                   // immediate once, then on genuine changes; returns off()
}
```

Semantics that matter:

- **Setters never throw.** Invalid key/shape/enum/range returns
  `{ ok:false, error:{ code, message }, state }` and changes nothing.
- `setState()` accepts deeplink parameter names (`preset`, `tab`, `r`, …, `twin`, `bit`,
  `mz`, `mf`, toggle names, `fx/fy/fz`, `static`, `anim`, `pt`, `slot`, …) and applies them
  synchronously to the live view.
- `setClock(t)` sets `transport.playT` (clamped 0–1) **and pauses** so the frame is
  reproducible; `step(delta)` is a clamped delta; `reset()` restores preset 12/scopes/defaults.
- **No-op setters emit no change event**; exactly one `ramanujan-sphere:change` fires on
  mount. Animation ticks advance `playT` without spamming events — pause or poll.
- `subscribe(fn)` fires immediately once, then only on genuine structural changes;
  unsubscribing is idempotent and a throwing subscriber is isolated.

### 5.1 Runnable snippets (DevTools console / CDP `Runtime.evaluate`)

```js
// read
window.ramanujanSphere.ready                                   // true
window.ramanujanSphere.getState().preset.index                 // 12 on a fresh load
window.ramanujanSphere.getState().derived.shell.volShell       // hollow-shell volume

// drive the live UI
window.ramanujanSphere.setTab('bits')                          // {ok:true, state}
window.ramanujanSphere.setState({ preset: 12, twin: 'conjugate', static: 1 })
window.ramanujanSphere.setClock(0.25)                          // pause + pin playhead
window.ramanujanSphere.step(0.1)                               // clamped to 0.35
window.ramanujanSphere.pause()
window.ramanujanSphere.reset()

// pure tool calls (never touch the UI)
window.ramanujanSphere.call('fourbit_orbit', { R: 1, playT: 0 })
window.ramanujanSphere.call('bit_inspect', { value: 3.141592653589793 }) // hex 0x40490FDB
window.ramanujanSphere.call('analyze_patch', { preset: 12, samples: 3200 })

// link + subscription
const link = window.ramanujanSphere.getDeeplink()
const off = window.ramanujanSphere.subscribe(s => console.log('changed:', s.tab))
off()                                                          // idempotent
```

Failure shape:

```js
window.ramanujanSphere.setState({ tab: 'nope' })
// { ok:false, error:{ code:'E_BAD_TAB', message:'…' }, state:{…unchanged…} }
```

### 5.2 Automation hooks

- `document.body[data-agent-ready="true"]` — bridge installed.
- `window` events `ramanujan-sphere:ready` (once) and `ramanujan-sphere:change`
  (`event.detail` = state object).
- Selectors: `[data-agent-tab="<tab>"]`, `[data-agent-panel="<tab>"]`,
  `[data-agent-input="<name>"]`, `[data-agent-toggle="<name>"]`,
  `[data-agent-zoom="<n>"]`, `[data-agent-focus="<name>"]`,
  `body[data-agent-clock="<playT>"]`, `body[data-agent-active-tab="<tab>"]`,
  `[data-agent-status="bridge-active"]`.
- `#ramanujan-sphere-state` — the hidden state JSON (compact `JSON.stringify`).
- The **Agent** tab (`[data-agent-panel="agent"]`) shows bridge status, the current deeplink
  with copy, the copyable handoff prompt, live state JSON, the tool catalogue and links to
  `AGENTS.md`, `docs/AGENT-INTERFACE.md`, `agent/manifest.json`.

---

## 6. Surface 3 — headless transports: CLI and MCP

Both read the same `js/agent-core.js` registry and emit the same envelope. Neither needs a
browser or a server; both need Node.js.

### 6.1 CLI — `agent/cli.mjs`

```text
node agent/cli.mjs <command> [flags] [--json]
```

Commands (`help`, `manifest`, `build_deeplink`/`deeplink`, the seven maths tools, `state`,
`artifacts [--check]`, `selftest`):

| command | what it returns |
|---|---|
| `help` | command list + flag help |
| `manifest` | envelope whose `data` is the manifest |
| `build_deeplink` | `{url, query}` (alias `deeplink`) |
| `analyze_patch` | shell metrics, zone counts, stats, 5 canonical samples |
| `eval_point` | point + IEEE-754 bits + twin + telemetry readout at `t` |
| `bit_inspect` | one `float32` value as hex/bin/sign/exponent/mantissa |
| `discrete_group` | cyclic order-`N` orbit + subgroup structure |
| `ramanujan_pi` | Ramanujan vs Fourier `float32` π convergence rows |
| `fourbit_orbit` | meridian/equator pairs, nibble, Quadray tetrahedron vertices |
| `frobenius_secp` | `secp256k1` Frobenius trace/point counts (BigInt-safe strings) |
| `state` | the UI-state object (not an envelope) |
| `artifacts --check` | verifies the committed generated artifacts are current (without `--check` the command regenerates them); exit code forwarded |
| `selftest` | runs `agent/selftest.mjs` |

Global flags: `--json`, `--base <url>`, `--args '<json>'`, `--preset`, `--tab`, `--slot`,
`--static`, `--animate`, `--autoRotate`, `--pt`/`--playT`, `--x/--y/--z`,
`--r --rIn --amp --f --K --orderN --a --b --n --m --k --phase`, `--t`, `--samples`,
`--value`, `--special`, `--stride`, `--maxK`, `--R`, `--check`, the `build_deeplink` view
enums `--twin`, `--bit`, `--mz`, `--mf`, and the §4 boolean toggles `--cut --slice --strobe
--fourbit --quadray --mag --ghost --ref --surf --wire --grid --axes --rvec --rtrace`.
Arbitrary view args go through `--args '<json>'`. Both `--flag=value` and `--flag value`
work.

```powershell
node agent/cli.mjs help
node agent/cli.mjs manifest --json
node agent/cli.mjs build_deeplink --preset 5 --tab harmonics --static --json
node agent/cli.mjs analyze_patch --preset 12 --samples 64 --json
node agent/cli.mjs eval_point --preset 12 --t 0.25 --json
node agent/cli.mjs bit_inspect --value 3.141592653589793 --json
node agent/cli.mjs discrete_group --orderN 19 --stride 3 --json
node agent/cli.mjs ramanujan_pi --maxK 4 --json
node agent/cli.mjs fourbit_orbit --R 1 --playT 0 --json
node agent/cli.mjs frobenius_secp --k 4 --json
node agent/cli.mjs state --preset 12 --json
```

`--json` prints **only** the one envelope to stdout (or the state object for `state`); all
diagnostics go to stderr. Exit codes: `0` ok · `2` usage · `3` tool error (`E_*` in the
envelope) · `4` internal. Pipe to Node to consume it:

```powershell
node agent/cli.mjs fourbit_orbit --R 1 --playT 0 --json |
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const e=JSON.parse(s);console.log(e.data.quadray.D_0001.label, e.data.nibble.hex)})"
```

### 6.2 MCP stdio server — `agent/mcp-server.mjs`

Newline-delimited JSON-RPC 2.0 on stdin/stdout, zero dependencies, **stdout carries protocol
messages only**. It exposes exactly the nine pure tools.

Client config — use an **absolute path** to the server script (Windows path with spaces is
fine inside a JSON string; forward slashes are safest). Claude Desktop style
(`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ramanujan-sphere": {
      "command": "node",
      "args": ["C:/Users/trevor/Documents/Ramanujan Sphere/agent/mcp-server.mjs"]
    }
  }
}
```

Cursor style (`.cursor/mcp.json` in a project, or the global Cursor MCP config — same shape):

```json
{
  "mcpServers": {
    "ramanujan-sphere": {
      "command": "node",
      "args": ["C:/Users/trevor/Documents/Ramanujan Sphere/agent/mcp-server.mjs"]
    }
  }
}
```

If `node` is not on the client's `PATH`, use the absolute executable
`C:/Program Files/nodejs/node.exe` as `command`. Protocol surface: `initialize`
(`protocolVersion: "2025-06-18"`, `capabilities.tools`, `serverInfo.name:
"ramanujan-sphere"`), silent `notifications/initialized`, `ping`, `tools/list`,
`tools/call` (`content:[{type:"text", text:<envelope JSON>}]`, `isError` true when
`ok:false`), clean EOF exit `0`. `node agent/selftest.mjs` exercises the handshake,
`tools/list` and `tools/call` end-to-end.

Manual smoke test (send a minimal session and read the responses):

```powershell
@(
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0"}}}',
  '{"jsonrpc":"2.0","method":"notifications/initialized"}',
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
) | node agent/mcp-server.mjs
```

### 6.3 Generated artifacts

```powershell
node scripts/gen-agent-artifacts.mjs           # (re)write agent/manifest.json + agent/examples/*
node scripts/gen-agent-artifacts.mjs --check   # exit 0 iff committed bytes are current
```

Generated (never hand-edit): `agent/manifest.json` (byte-equal to
`JSON.stringify(getManifest(), null, 2) + "\n"`), `agent/examples/<tool>.json` (one default
success envelope per tool) and `agent/examples/README.md`. Output is deterministic — no
timestamps, no randomness — so `--check` is a reliable drift gate.

---

## 7. Where truth lives

| Concern | File (owner) | Notes |
|---|---|---|
| `float32` maths, shell zones, twins, bits, groups, Frobenius | `js/engine.js` | single source for browser **and** Node; `.fround()` everywhere |
| Preset catalogue | `js/presets.js` | declarative; default preset index 12 |
| Tools, envelopes, deeplinks, UI-state projection, manifest | `js/agent-core.js` | the only shared agent layer |
| Page state, DOM sync, URL sync | `js/app.js` | never duplicates maths |
| Bridge + Agent panel DOM filling | `js/agent-bridge.js` | installs `window.ramanujanSphere` once |
| Markup / styles | `index.html`, `css/styles.css` | additive `data-agent-*` hooks only |
| CLI / MCP / self-test | `agent/cli.mjs`, `agent/mcp-server.mjs`, `agent/selftest.mjs` | zero dependencies |
| Artifact generator | `scripts/gen-agent-artifacts.mjs` | deterministic, `--check` |
| Generated artifacts | `agent/manifest.json`, `agent/examples/*` | generator-owned |
| Unit tests | `tests/*.test.mjs` | engine vectors, registry/envelopes, deeplinks, artifacts |
| **Normative contract** | `docs/AGENT-INTERFACE.md` | if code and contract disagree, code is wrong |
| Onboarding (this file) | `AGENTS.md` | |
| Machine index | `llms.txt`, `agent/manifest.json` | |
| Cross-tool map | `docs/ECOSYSTEM-MAP.md` | honest statuses: available vs planned |

---

## 8. Invariants — do not break these

1. **One implementation.** Never copy a formula or state projection into a transport. Browser
   and Node import `js/engine.js` + `js/agent-core.js`; add capability there and every surface
   inherits it. Two sources of truth make the layer worse than useless.
2. **Deterministic output.** No timestamps, randomness, `Date`, locale formatting or object-key
   churn in results/artifacts. Identical args ⇒ byte-identical JSON (`--check` enforces it).
3. **Closed envelope, closed error set.** Success/failure shapes are fixed
   (`{ok, schemaVersion, tool, data, deeplink, warnings}` / `{ok:false, …, error:{code,message,hint?}, warnings}`);
   error codes are exactly the eight in contract §3. `callTool` never throws.
4. **Pure tools are read-only.** Tool calls never touch the DOM or live state. Only bridge
   setters change what the user sees.
5. **Additive only.** Do not change the maths, rendering, default preset or default UX to
   satisfy an agent surface. The only visible addition is the Agent dock tab.
6. **State is inspectable, not scraped.** `getState()` and `#ramanujan-sphere-state` expose the
   same object; renderers never parse DOM text for state.
7. **Static mode is the screenshot contract.** Same deeplink + `static=1` ⇒ same state/pixels;
   reload twice ⇒ byte-identical state.
8. **Delta URLs, no history spam.** Emit only non-base params; sync with debounced
   `replaceState`, never `pushState`; guard for `file://`.
9. **Renames are schema bumps.** Additive fields are fine; renaming/removing a tool, field or
   parameter requires a schema/toolset version change in the contract and the core.
10. **Generated files are generated.** Edit `js/agent-core.js`/the generator, then re-run it;
    never hand-edit `agent/manifest.json` or `agent/examples/*`.

---

## 9. Acceptance commands

Run from the repository root (serve the app first if the check needs HTTP):

```powershell
node --test                                     # unit: engine vectors, registry, envelopes, deeplinks, artifacts
node scripts/gen-agent-artifacts.mjs --check    # committed artifacts current and idempotent
node agent/selftest.mjs                         # CLI + MCP + canonical vectors
node agent/verify-static.mjs --base http://127.0.0.1:8080/   # served paths, dump-dom state, artifact bytes
node agent/verify-browser.mjs --base http://127.0.0.1:8080/  # CDP checklist (events, setters, reload, layout)
```

`node --test` uses Node's test-file auto-discovery (`tests/*.test.mjs`). On Node 24 a bare
directory argument is treated as a module path, so `node --test tests/` fails with
`MODULE_NOT_FOUND`; use auto-discovery or an explicit glob
(`node --test "tests/**/*.test.mjs"`).

`verify-static` and `verify-browser` are the independent verifier's harnesses (they drive the
served app and a fresh headless Chrome); if a checkout lacks them, the first three commands
plus the checks below are the headless gate. Baseline that must always hold: `?static`
renders with `window.__agree === true`, no console errors, default preset 12.

---

## 10. Resource map

| Path | Purpose |
|---|---|
| `index.html` | the zero-scroll studio shell; 5 dock tabs incl. Agent (Agent pane 344px, other tabs 228px) |
| `js/engine.js` | `float32`/`BigInt` single source of truth |
| `js/presets.js` | preset catalogue (14 entries, index 0–13) |
| `js/agent-core.js` | agent registry, envelopes, deeplinks, state projection, manifest |
| `js/agent-bridge.js` | browser bridge + Agent panel |
| `js/app.js` | page state, DOM sync, URL sync, RAF loop |
| `js/scene3d.js`, `js/lissajous2d.js`, `js/timeseries.js`, `js/harmonics2d.js`, `js/frobenius.js`, `js/magnifier2d.js`, `js/views.js` | renderers |
| `agent/cli.mjs` | zero-dep CLI (`--json`) |
| `agent/mcp-server.mjs` | zero-dep MCP stdio server |
| `agent/selftest.mjs` | CLI + MCP + vector self-test |
| `agent/manifest.json`, `agent/examples/` | generated discovery artifacts |
| `scripts/gen-agent-artifacts.mjs` | deterministic generator (+ `--check`) |
| `tests/` | unit tests |
| `docs/AGENT-SCREENSHOTS.md`, `docs/agent/*.png` | committed reference screenshots (reproduce with `verify-browser.mjs --capture`) |
| `package.json` | npm scripts `test`, `artifacts`, `artifacts:check`, `cli`, `mcp`, `selftest`, `verify:browser`, `serve`; zero dependencies, no `"type":"module"` |
| `docs/AGENT-INTERFACE.md` | normative contract |
| `docs/ARCHITECTURE.md` | module boundaries, extension recipes |
| `docs/ECOSYSTEM-MAP.md` | sibling tools, handoff data, phased plan |
| `HARMONY_ENGINE.md` | mathematical derivations |
| `README.md` | maths pillars, presets, shortcuts, agent section |
| `vendor/` | vendored Three.js r128 + OrbitControls (offline) |
| `SchoolOfTomorrow/` | gitignored external reference archive — not served, not imported |

---

## 11. Screenshot workflow

1. Build the link for the exact state you want (CLI `build_deeplink` or `getDeeplink()`).
2. Always add `static=1` (freeze transport + camera orbit) — else the clock advances.
3. Open it in a fresh browser profile; wait for `body[data-agent-ready="true"]`.
4. Capture, then capture again from a reload of the same URL and compare state JSON —
   reproducibility is the acceptance test.
5. For headless Chrome on Windows: use a **unique `--user-data-dir`** per invocation, launch
   with `Start-Process -Wait`, and give it `--virtual-time-budget`; otherwise a running Chrome
   may swallow the invocation and write nothing.
6. Reproduce the committed reference images with the verifier's harness:
   `node agent/verify-browser.mjs --base http://127.0.0.1:8080/ --capture` (runs the 58-check
   browser checklist first, then writes `docs/agent/*.png`). The exact links, viewports,
   SHA-256 hashes and a minimal single-image PowerShell recipe are in
   [`docs/AGENT-SCREENSHOTS.md`](docs/AGENT-SCREENSHOTS.md).

---

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `window.ramanujanSphere` is `undefined` | page not the current build / not loaded yet | hard-refresh; check `document.body.dataset.agentReady === 'true'`; open via the served URL |
| `fetch('agent/manifest.json')` rejects | page opened from `file://` (opaque origin) | serve the folder (`python -m http.server 8080 --bind 127.0.0.1`) or use the CLI/MCP |
| Address bar does not update on tweaks | `file://` URL sync is best-effort (guarded `replaceState`) | read `window.ramanujanSphere.getDeeplink()` instead |
| DOM state JSON and `getState()` differ | animate mode advanced the clock between reads | load with `static=1`, or call `pause()`/`setClock()` first |
| Deeplink seems ignored | typo/enum value not in the grammar (tolerant parser falls back) | compare with §4.1 / `build_deeplink` output; check `getState()` fields |
| Port 8080 already in use | another server running | `python -m http.server 8081 --bind 127.0.0.1`, open the new port, pass `--base http://127.0.0.1:8081/` to CLI/link builders |
| Clipboard copy buttons do nothing | clipboard permission denied (context/headless) | read the deeplink/state text directly (`getDeeplink()`, panel `<pre>`); use `static=1` for stable JSON |
| `node: command not found` | Node not installed / not on PATH | install Node.js (verified on v24.14.1) or use `C:/Program Files/nodejs/node.exe` in MCP config |
| MCP client lists no tools | wrong/relative `args` path, or client did not restart | use the absolute `agent/mcp-server.mjs` path; run the manual smoke test in §6.2; MCP stdout must stay clean |
| CLI exits `3` | a tool error envelope (`E_*`), not a crash | parse the printed envelope's `error.code` / `error.hint` |
| `artifacts --check` exits non-zero | generated artifacts stale/missing | run `node scripts/gen-agent-artifacts.mjs` then re-check; never hand-edit artifacts |
| Headless Chrome screenshot blank / locks | normal Chrome session intercepted the invocation | unique `--user-data-dir`, `Start-Process -Wait`, `--headless=new`, `--virtual-time-budget` |
| Page still animates when you expected a frozen frame | the URL did not include `static=1` (animate + auto-rotate are on by default) | open a `build_deeplink --static` link or append `static=1`; check `getState().transport.staticMode === true` |
| Node `require('./js/engine.js')` returns `{PRECISION, engine}` | dual export shape (by design) | use `require('./js/engine.js').engine`; or `require('./js/agent-core.js')` for tools |

---

## 13. Related tools

- [`docs/ECOSYSTEM-MAP.md`](docs/ECOSYSTEM-MAP.md) — sibling quadray/IVM tools in the local
  `SchoolOfTomorrow/` reference archive, the exact handoff data (Quadray tetrahedron ↔
  `fourbitOrbit.quadray`, QuadCraft save JSON), and the phased plan: documented manifest (v1,
  now) → live query-param handoff (planned) → shared manifest (planned). Never assume a link
  marked *planned* exists.
- [`README.md`](README.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md),
  [`HARMONY_ENGINE.md`](HARMONY_ENGINE.md) — the instrument itself.

---

## 14. Handoff prompt (what the Agent tab copies)

When a human clicks **Copy handoff prompt** in the Agent tab, the copied text contains the
current deeplink, the path to `AGENTS.md`, `window.ramanujanSphere`, the
`agent/manifest.json` path and every tool name. A hand-written equivalent that works with a
fresh agent:

> You are driving Ramanujan's Gift (`ramanujan-sphere`, schema 1). Read
> `AGENTS.md` and `docs/AGENT-INTERFACE.md` in
> `C:\Users\trevor\Documents\Ramanujan Sphere`; the app is served at
> `http://127.0.0.1:8080/`. Read state from `window.ramanujanSphere.getState()` or the hidden
> `#ramanujan-sphere-state` element; call the nine pure tools with
> `window.ramanujanSphere.call(name, args)` or `node agent/cli.mjs <name> --json`; the tool
> catalogue and schemas are in `agent/manifest.json` and `agent/examples/`. Current view:
> `<paste the deeplink here>`. Do not edit the maths or the page — report defects instead.
