# Agent Interface Contract — `ramanujan-sphere` v1 (toolset 1.0.0)

This is the **normative** contract for the agent layer of **The Ramanujan Sphere**.
`AGENTS.md` is the human/LLM onboarding; this file is the precise spec that the browser page,
bridge, CLI, MCP server, generator and tests implement. If code and this document disagree,
the code is wrong — fix the contract once, then every consumer.

Design rules (non-negotiable):

1. **One implementation.** The maths live in `js/engine.js` (`Harmony.engine`, the existing single
   source of truth). The agent layer lives in `js/agent-core.js` (`Harmony.AgentCore`). The page,
   bridge, CLI, MCP server and generator all import/reuse those two files. Nothing re-implements a
   formula or a state projection.
2. **Deterministic output.** No timestamps, randomness, locale formatting, `Date`, or key churn in
   tool results. Identical arguments ⇒ byte-identical JSON.
3. **One envelope, one error shape.** Every tool result and every transport emits the envelope in §3.
4. **Read-only tools, explicit UI effects.** Pure tools never touch the DOM. Only bridge setters
   change what the user sees.
5. **Additive.** The instrument's maths, rendering and default UX must not change. The agent layer
   wraps the existing state; the only visible addition is a fifth `Agent` dock tab.

Identity (must match across surfaces):

| field | value |
|---|---|
| tool id | `ramanujan-sphere` |
| title | `The Ramanujan Sphere` |
| bridge global | `window.ramanujanSphere` |
| hidden state element | `#ramanujan-sphere-state` |
| window events | `ramanujan-sphere:ready`, `ramanujan-sphere:change` |
| MCP `serverInfo.name` | `ramanujan-sphere` |
| `SCHEMA_VERSION` | `1` |
| `TOOLSET_VERSION` | `1.0.0` |
| default preset | index `12` — `Four-Bit Orbit — 1000 (8) ↔ 0001 (1) Palindrome & Quadray` |

---

## 1. Shared core (`js/agent-core.js`)

Classic script (works from `file://` **and** served) with dual export, like `js/engine.js`:

```js
// browser
<script src="js/agent-core.js"></script>   // after engine.js + presets.js
Harmony.AgentCore
// Node (CommonJS; do not add "type":"module")
const AgentCore = require('./js/agent-core.js');
```

Exported surface (fixed; additions are fine, renames are a schema bump):

```js
tripass: SCHEMA_VERSION, TOOLSET_VERSION, TOOL_ID, TOOL_GLOBAL /* 'ramanujanSphere' */,
         STATE_SELECTOR /* '#ramanujan-sphere-state' */, EVENT_READY, EVENT_CHANGE,
         DEFAULT_PRESET_INDEX /* 12 */, DEFAULT_TAB /* 'scopes' */,
         TABS /* ['scopes','harmonics','frobenius','bits','agent'] */,
         ERROR_CODES /* closed array, §3 */,
         PRESET_CATALOG /* [{index,name,group,note}] */,
         TOOL_NAMES, TOOLS, callTool, getManifest,
         defaultState(), resolveState(overrides),
         validatePatch(patch), changedKeys(state, presetIndex, patch),
         projectUiState(stateLike, opts), deeplinkForState(stateLike, opts),
         buildDeeplink(args), parseDeeplink(searchOrUrl),
         captureSnapshot(stateLike, presetIndex), snapshotFromPreset(index, extra),
         sampleSnapshotPoints(snap), stateFromSnapshot(snap),
         serialize(value) /* JSON.stringify(value,null,2)+'\n' */
```

`resolveState(overrides)` returns a *state-like* object with the same shape the page uses:
`{ presetIndex, r, rIn, amp, f, K, orderN, a, b, n, m, k, phaseRad, phaseDeg, formulas:{x,y,z},
twinMode, bitSource, magZoom, magFocus, activeTab, activeSlot, toggles:{…}, playT, staticMode }`.
Numbers are plain JS numbers (the page rounds display only). Defaults come from preset 12 plus
the page's default toggle table; `overrides.preset` re-bases everything, explicit override keys win.

`projectUiState(stateLike, opts)` builds §5. `opts = { presetIndex, presetName, points, base,
ready, staticMode, slot, version }`. If `points` is omitted it samples with `Engine.sample(stateLike, 3200)`
so Node and browser derive identical values.

---

## 2. Tools (v1) — 9 pure read-only tools, canonical registry order

Every tool is `scope:'pure'`. Shared "patch selector" arguments, accepted by `analyze_patch`,
`eval_point`, `build_deeplink` and `state`-like builders:

| arg | type | bounds | meaning |
|---|---|---|---|
| `preset` | integer | 0–13 | base preset index (see `PRESET_CATALOG`); default 12 |
| `formulas` | object `{x,y,z}` | strings ≤512 chars | formula overrides, validated by `Engine.validate` |
| `r` | number | 0.3–2.6 | outer carrier R |
| `rIn` | number | 0–2.4, clamped ≤ r | inner cavity r |
| `amp` | number | 0.1–2.5 | gain amplitude |
| `f` | number | 0.5–8 | frequency |
| `K` | integer | 0–14 | harmonic partials |
| `orderN` | integer | 5–64 | discrete cyclic order N |
| `a` | number | 0.15–0.85 | Weierstrass decay a |
| `b` | integer | 2–9 | Weierstrass lacunarity b |
| `n`,`m`,`k` | integer | 1–8 | Lissajous / stride ratios |
| `phaseDeg` | number | −180–180 | phase in degrees |

Unknown keys ⇒ `E_BAD_ARGS`; out-of-bounds numerics ⇒ `E_OUT_OF_RANGE`.

### 2.1 `manifest`
Args `{}`. Data: the object from `getManifest()` (§7). Use first to discover everything.

### 2.2 `build_deeplink`
Args: shared patch selector + `tab` (§4 enum), `static` (boolean), `animate` (boolean),
`autoRotate` (boolean), `playT` (0–1), the view enums `twin`, `bit`, `mz`, `mf`, the boolean
toggle params of §4 (`cut`, `slice`, `strobe`, `fourbit`, `quadray`, `mag`, `ghost`, `ref`,
`surf`, `wire`, `grid`, `axes`, `rvec`, `rtrace`), `fx`/`fy`/`fz` formula strings, and
`base` (absolute URL string, default `http://127.0.0.1:8080/`). View args go through the same
validator as the bridge's `setState`. Data: `{ url, query }` where `query` is the
emitted-param object in canonical order. Envelope `deeplink` = `url`.

```json
{ "ok": true, "schemaVersion": 1, "tool": "build_deeplink",
  "data": { "url": "http://127.0.0.1:8080/?preset=5&tab=harmonics",
            "query": { "preset": "5", "tab": "harmonics" } },
  "deeplink": "http://127.0.0.1:8080/?preset=5&tab=harmonics", "warnings": [] }
```

### 2.3 `analyze_patch`
Args: shared patch selector + `samples` (integer 32–3200, default 3200). Samples the patch through
`Engine.sample` and reports what the instrument draws, without pixels.

Data keys (fixed order):
`preset`, `formulas`, `params`, `shell`, `samples`, `curveValid`, `errors`, `stats`, `samplesAt`.

- `preset`: `{ index, name }`
- `formulas`: `{ x, y, z }` (resolved)
- `params`: the 12 numeric/degree inputs (resolved)
- `shell`: `{ R, rIn, thickness, volOuter, volCavity, volShell }` from `Engine.shellMetrics`
- `curveValid`: boolean (`false` if any axis expression is invalid)
- `errors`: `{ x, y, z }` — null or `'invalid x(t)'` style strings
- `stats`: `{ validCount, invalidCount, maxAbs, zoneCounts, extents }` where `zoneCounts` is
  `{ onSphere, inShell, inCavity, outside }` from `Engine.zoneOf` and `extents` is
  `{ x:{min,max}, y:{min,max}, z:{min,max} }` over valid float32 points
- `samplesAt`: `[ { t, x, y, z, valid } ]` at exactly `t = 0, 0.25, 0.5, 0.75, 1`

Envelope `deeplink` = canonical link that reproduces this patch (`preset`+overrides; `static=1`).

### 2.4 `eval_point`
Args: shared patch selector + `t` (number 0–1, default `0.25`).
Data: `{ t, point, bits, twin, readout }`.

- `point`: `{ x, y, z, valid }` in float32
- `bits`: `{ x, y, z }` — each the `Engine.bitInspect` object (`val,hex,bin,signBit,expBits,mantBits,expDesc,kind`)
- `twin`: `{ mode, antipodal, conjugate, realTrace }` — points or null, from `Engine.playhead`
- `readout`: `{ angle, dist, status, distNum }` — the visible telemetry strings
Envelope `deeplink` = link reproducing the patch (`static=1`, `pt=t` when `t≠0`).

### 2.5 `bit_inspect`
Args: `value` (finite JSON number) **or** `special` (`'nan'|'+inf'|'-inf'`; if present `value` is
ignored). One of the two is required (`E_EMPTY_INPUT` otherwise). Data: `{ input, val, hex, bin,
signBit, expBits, mantBits, expDesc, kind }` where `input` is the echoed number/string.
Example: `bit_inspect { "value": 3.141592653589793 }` → `hex: "0x40490FDB"`.

### 2.6 `discrete_group`
Args: `orderN` (integer 5–64, default 19), `stride` (integer 1–8, default 3).
Data: `{ N, stride, gcd, subOrder, isPrime, orbit, orbitLength, inSubgroupCount, nodes }` where
`orbit` is the generator walk `[0, g mod N, 2g mod N, …]` closed back to `0`, `nodes` is
`[{ idx, t, inSubgroup }]` for `idx = 0..N−1` (`t = idx/N`).

### 2.7 `ramanujan_pi`
Args: `maxK` (integer 0–6, default 4).
Data: `{ targetPiF32, targetHex, targetBits, lockedAtK0, rows }` where each row is
`{ k, piRamF32, ramHex, ramLocked, ramErrDb, piFourF32, fourHex, fourLocked, fourErrDb }`
(`*ErrDb` rounded to 3 decimals; `targetHex` must be `0x40490FDB`).

### 2.8 `fourbit_orbit`
Args: `R` (number 0.1–2.6, default 1), `f` (0.5–8, default 1), `phaseDeg` (−180–180, default 0),
`playT` (0–1, default 0).
Data: `{ R, theta, deg, meridian8, meridian1, equator8, equator1, real8, real1, quadray, nibble }`
where `quadray` is `{ D_0001, A_1000, B_0100, C_0010 }` and `nibble` is `{ val, bin, hex }`.
Envelope `deeplink` = `preset=12` with `r=R`, `f=f`, `phase=phaseDeg`, `static=1`, `pt=playT` when
`playT≠0`.

### 2.9 `frobenius_secp`
Args: `k` (integer 1–16, default 4). Data: `{ k, curve:'secp256k1', p, n, trace, pointCount,
phiDeg, cosPhi, sqrtP, hasseBound, gPrefix }`. All integers are **decimal strings** (BigInt-safe,
JSON-safe); `phiDeg`/`cosPhi`/`sqrtP`/`hasseBound` are numbers.

---

## 3. Envelope and errors

Success — key order fixed:

```json
{ "ok": true, "schemaVersion": 1, "tool": "<tool>", "data": { }, "deeplink": null, "warnings": [] }
```

Failure — key order fixed:

```json
{ "ok": false, "schemaVersion": 1, "tool": "<tool>",
  "error": { "code": "E_OUT_OF_RANGE", "message": "…", "hint": "…" }, "warnings": [] }
```

Closed v1 error-code set (`ERROR_CODES`, exact strings):
`E_BAD_ARGS`, `E_UNKNOWN_TOOL`, `E_EMPTY_INPUT`, `E_INVALID_EXPR`, `E_INPUT_TOO_LARGE`,
`E_BAD_TAB`, `E_OUT_OF_RANGE`, `E_INTERNAL`.

Rules: `callTool` never throws; `args === undefined` means `{}`; `error.hint` is present when a fix
is known; internal failures never leak a stack (`E_INTERNAL` with a short message). `warnings` is a
`string[]` (empty on success unless a validation was tolerated — tools do not tolerate).

---

## 4. Deeplink grammar

Query params on the page URL (`file://` works too; `history.replaceState` is guarded in a try).
Canonical emitter order is **exactly**:

```
preset, tab, static, anim, orbit, pt,
r, rIn, amp, f, K, orderN, a, b, n, m, k, phase,
twin, bit, mz, mf,
cut, slice, strobe, fourbit, quadray, mag, ghost, ref,
surf, wire, grid, axes, rvec, rtrace,
fx, fy, fz
```

| param | values | default |
|---|---|---|
| `preset` | integer 0–13 | `12` |
| `tab` | `scopes\|harmonics\|frobenius\|bits\|agent` | `scopes` |
| `static` | `1` | absent (freeze: `animate=false`, `autoRotate=false`) |
| `anim` | `0\|1` | `1` |
| `orbit` | `0\|1` | `1` |
| `pt` | number 0–1, ≤6 dp | `0` (implies `anim=0` when present) |
| `r`,`rIn`,`amp`,`f`,`a`,`phase` | numbers (as §2 bounds) | preset/base state |
| `K`,`orderN`,`n`,`m`,`k`,`b` | integers | preset/base state |
| `twin` | `off\|antipodal\|conjugate\|both` | preset/base state |
| `bit` | `auto\|main\|ramanujan` | `auto` |
| `mz` | `4\|16\|64\|256` | `16` |
| `mf` | `playhead\|origin\|trough` | `trough` |
| `cut`,`slice`,`strobe`,`fourbit`,`quadray`,`mag`,`ghost`,`ref`,`surf`,`wire`,`grid`,`axes`,`rvec`,`rtrace` | `0\|1` | base-state toggle value |
| `fx`,`fy`,`fz` | URI-encoded formula strings | preset formulas |

Encoding rules:

- **Delta encoding.** A param is emitted only when its value differs from the *base state*
  (default preset + default toggles, or `preset`'s own values when `preset` is emitted). So the
  default view has an empty query, and `preset=5&tab=harmonics` is enough to reproduce preset 5's
  harmonics tab. Boolean toggles are emitted as explicit `0`/`1` only when they differ from base.
- Numbers are formatted as `String(Number(value.toFixed(6)))`; integers as `String(n)`; no locale.
- Parsing is **tolerant**: unknown params are ignored; invalid enum values fall back to the base
  value and append a warning; invalid numbers are ignored with a warning. A deeplink never crashes
  the page.
- Precedence: `preset` first (applies formulas/params/hints), then explicit params override it.
- The page parses the query on mount, applies it, then keeps the URL in sync with a **debounced
  (≈300 ms) `history.replaceState`**. No `pushState`, no history entries. If `location.hash` starts
  with `#patch=`, URL sync is disabled (legacy Share-Link mode keeps the hash).
- `getDeeplink()` returns the absolute URL for the *current* state; reloading it twice must produce
  byte-identical `getState()` output. This is the screenshot contract.

---

## 5. UI state schema — `getState()` and `#ramanujan-sphere-state`

Top-level keys, fixed order:

```json
{
  "schemaVersion": 1,
  "ready": true,
  "tool": "ramanujan-sphere",
  "preset": { "index": 12, "name": "Four-Bit Orbit — …" },
  "tab": "scopes",
  "slot": "A",
  "inputs": { "r": 1, "rIn": 0.45, "amp": 1, "f": 1, "K": 6, "orderN": 16,
              "a": 0.5, "b": 3, "n": 3, "m": 2, "k": 1, "phaseDeg": 0 },
  "formulas": { "x": "r*cos(TAU*f*t+phase)", "y": "r*sin(TAU*f*t+phase)", "z": "0" },
  "toggles": { "cutaway": false, "sliceGrid": true, "surface": true, "wireframe": true,
               "grid": true, "axes": true, "radiusVec": true, "realTrace": true,
               "strobeN": false, "fourBitOrbit": true, "quadrayTetra": true,
               "magnifier": false, "ghostRef": false, "refWaves": false },
  "twinMode": "both",
  "bitSource": "auto",
  "magnifier": { "zoom": 16, "focus": "trough" },
  "transport": { "playT": 0, "animate": false, "autoRotate": false, "staticMode": true },
  "derived": {
    "shell": { "R": 1, "rIn": 0.45, "thickness": 0.55, "volOuter": 4.1887902047863905,
               "volCavity": 0.3817035074111599, "volShell": 3.8070866973752304 },
    "playhead": { "t": 0, "x": 1, "y": 0, "z": 0, "valid": true,
                  "dist": 1, "zone": "ON SPHERE", "angleDeg": 0,
                  "twin": { "mode": "both", "x": 1, "y": 0, "z": 0 } },
    "fourbit": { "deg": 0, "nibble": { "val": 8, "bin": "1000", "hex": "0x8" } },
    "readout": { "angle": "0.0° (0.0000 rad)", "dist": "1.000  [r=0.45..R=1.00]",
                 "status": "ON SPHERE", "distNum": 1 }
  },
  "deeplink": "http://127.0.0.1:8080/",
  "bridge": { "schemaVersion": 1, "version": "1.0.0" }
}
```

- `derived` carries exactly what the visible panels show, recomputed by the shared core (never read
  from DOM text). `derived.readout` is the telemetry strip; `derived.playhead` is the playhead in
  float32; `derived.fourbit` is the Four-Bit Orbit nibble card; `derived.shell` is the vessel meters.
- Invalid free-text formulas degrade: `formulas` echo the strings, `derived.playhead` may be
  `null`-ish values (`x:null,...`) and `warnings` are not part of state; instead `derived.readout.status`
  becomes `"NO EVAL"`. Never throw.
- The hidden node `<pre id="ramanujan-sphere-state" data-schema-version="1" hidden>` is always
  mounted (every tab), and its `textContent` is `JSON.stringify(getState())` (compact). It is
  refreshed on every publish (state change) and on render frames so `transport.playT` stays live.
  In `static` mode (`?static=1`, the screenshot mode) DOM state and `getState()` are exactly equal
  at any instant. In animate mode the clock advances between reads by design.

---

## 6. Browser bridge — `window.ramanujanSphere`

```js
window.ramanujanSphere = {
  toolId: 'ramanujan-sphere', schemaVersion: 1, version: '1.0.0', ready: true,
  getManifest(), tools(),            // tools(): ToolDefs without run
  getState(),                        // §5, fresh object each call
  setState(patch),                   // -> {ok:true,state,warnings} | {ok:false,error,state}
  setTab(tab), setClock(t), step(delta), play(), pause(), reset(),
  call(name, args),                  // envelope from the shared registry
  getDeeplink(),                     // absolute current URL
  subscribe(fn),                     // immediate once, then on genuine changes; returns idempotent off
}
```

`setState(patch)` accepts deeplink param names (`tab`, `preset`, `r`, …, `twin`, `bit`, `mz`, `mf`,
toggle names, `fx/fy/fz`, `static`, `anim`, `orbit`, `pt`, `playT`, `animate`, `autoRotate`,
`slot`) and applies them to the live UI synchronously. Invalid key/shape/enum/range returns
`{ok:false,error:{code,message},state}` and changes nothing. **Setters never throw.**

Semantics:

- `setClock(t)` sets `transport.playT = clamp(t,0,1)` **and pauses** (`animate=false`) so the frame
  is reproducible; `step(delta)` = `setClock(playT + delta)` clamped; `play()/pause()` toggle
  `animate`; `reset()` restores the default state (preset 12, tab scopes, default toggles, playT 0).
- A no-op setter returns `{ok:true,state,warnings:[]}` and **emits no change event**.
- `subscribe` fires once immediately; unsubscribing is idempotent; a throwing subscriber is isolated.

Events and automation hooks:

- `document.body[data-agent-ready="true"]` once installed;
- `window` events `ramanujan-sphere:ready` (once, at install) and `ramanujan-sphere:change`
  (`detail` = state). **Exactly one `:change` on mount**, one per genuine structural mutation,
  zero for no-op setters. Continuous animation ticks advance `getState().transport.playT` but do not
  spam events; call `pause()`/`setClock()` or poll.
- `[data-agent-tab="<tab>"]` on dock tab buttons; `[data-agent-panel="<tab>"]` on dock panes;
  `[data-agent-input="<name>"]` on sliders/selects/formula inputs; `[data-agent-toggle="<name>"]` on
  HUD pills; `[data-agent-zoom="<n>"]`/`[data-agent-focus="<name>"]` on magnifier chips;
  `body[data-agent-clock="<playT 4dp>"]` updated each frame; `[data-agent-status="bridge-active"]`
  on the Agent panel status badge.
- The Agent panel (`[data-agent-panel="agent"]`) shows bridge status, the current deeplink with a
  copy button, a copyable handoff prompt (§6.1), live state JSON, the tool catalogue, and links to
  `AGENTS.md`, `docs/AGENT-INTERFACE.md`, `agent/manifest.json`.

### 6.1 Handoff prompt (copied from the Agent panel)

The prompt string must contain the current deeplink, `AGENTS.md`, `window.ramanujanSphere`, the
manifest path, and every tool name. Exact template lives in `js/agent-bridge.js` and is asserted by
the browser harness.

---

## 7. Manifest

`getManifest()` / `agent/manifest.json` (byte-identical to `JSON.stringify(getManifest(),null,2)+"\n"`):

```json
{
  "id": "ramanujan-sphere", "title": "The Ramanujan Sphere",
  "version": "1.0.0", "schemaVersion": 1,
  "description": "…what the instrument is and what agents can do…",
  "urls": { "app": "http://127.0.0.1:8080/", "manifest": "/agent/manifest.json",
            "agents": "AGENTS.md", "interface": "docs/AGENT-INTERFACE.md" },
  "deeplink": { "template": "{base}?preset={preset}&tab={tab}&…", "tabs": [ … ],
                "defaults": { "preset": 12, "tab": "scopes", … } },
  "ui": { "bridge": "window.ramanujanSphere", "ready": "body[data-agent-ready='true']",
          "stateSelector": "#ramanujan-sphere-state", "tabSelector": "[data-agent-tab]",
          "panelSelector": "[data-agent-panel]" },
  "tools": [ /* ToolDefs without run, canonical order */ ],
  "catalog": { "presets": [ { "index", "name", "group", "note" } ] },
  "invariants": [ "…" ],
  "relatedTools": [ { "id", "title", "path", "relationship", "status" } ]
}
```

`relatedTools` seeds the cross-tool map (`docs/ECOSYSTEM-MAP.md`): entries for the local
`SchoolOfTomorrow/` reference archive (QuadCraft2.html, QuadrayGrid4.html, Flextegrity_Lattice.html,
QuadraysResearch.ipynb, qrays.py) with `status:"available"` (local reference, untracked) — never
claim a live handoff that does not exist.

---

## 8. CLI — `agent/cli.mjs` (zero dependencies)

```
node agent/cli.mjs <command> [flags] [--json]
```

Commands: `help`, `manifest`, `build_deeplink` (alias `deeplink`), `analyze_patch`, `eval_point`,
`bit_inspect`, `discrete_group`, `ramanujan_pi`, `fourbit_orbit`, `frobenius_secp`, `state`,
`artifacts [--check]`, `selftest`.

Global flags: `--json` (print **only** the envelope on stdout), `--base <url>`, `--args <json>`,
`--preset <int>`, `--tab <enum>`, `--slot <A|B|C>`, `--static`, `--animate`, `--autoRotate`,
`--pt/--playT <0..1>`, `--x/--y/--z <expr>`, `--samples <int>`,
`--r --rIn --amp --f --K --orderN --a --b --n --m --k --phase <number>`,
`--t <0..1>` (`eval_point`), `--value <n>` / `--special <nan|+inf|-inf>` (`bit_inspect`),
`--stride <int>` (`discrete_group`), `--orderN` (also `discrete_group`), `--maxK <int>`
(`ramanujan_pi`), `--R <n>` (`fourbit_orbit`), `--check` (`artifacts`), and the `build_deeplink`
view enums `--twin --bit --mz --mf` plus the §4 boolean toggle flags
`--cut --slice --strobe --fourbit --quadray --mag --ghost --ref --surf --wire --grid --axes --rvec --rtrace`.
Both `--flag=value` and `--flag value` work.

- Default output = compact human summary; `--json` = exactly one envelope object (no banner, no
  extra lines). Diagnostics go to **stderr**.
- `state` composes §5 headlessly (flags: `--preset`, `--tab`, `--slot`, overrides) and prints the
  state object, not an envelope.
- Exit codes: `0` ok, `2` usage, `3` tool error (`E_*`), `4` internal. `artifacts --check` forwards
  the generator's exit code; `selftest` runs `agent/selftest.mjs`.

`package.json` scripts (no dependencies, no `"type":"module"`): `test`, `artifacts`,
`artifacts:check`, `cli`, `mcp`, `selftest`, `verify:browser`, `serve`.

---

## 9. MCP stdio server — `agent/mcp-server.mjs` (zero dependencies)

Newline-delimited JSON-RPC 2.0 on stdin/stdout; stdout carries protocol messages only.

- `initialize` → `{ protocolVersion:"2025-06-18", capabilities:{tools:{}},
  serverInfo:{name:"ramanujan-sphere", version:"1.0.0"} }`
- `notifications/initialized` → silent.
- `ping` → `{}`.
- `tools/list` → `{ tools: [ {name, description, inputSchema} ] }` (pure tools, canonical order).
- `tools/call` → `{ content:[{type:"text", text: JSON.stringify(envelope, null, 2)}], isError:false }`;
  unknown tool / bad args keep `isError:true` with the failure envelope text.
- Parse error `-32700`, invalid request `-32600`, unknown method `-32601`; clean EOF exit 0.
- Document absolute-path client configs in `AGENTS.md`.

---

## 10. Static artifacts — generator

`node scripts/gen-agent-artifacts.mjs [--check]`, deterministic, no timestamps:

```
agent/manifest.json                 # JSON.stringify(getManifest(),null,2)+"\n"
agent/examples/manifest.json        # envelope whose data is the manifest
agent/examples/<tool>.json          # one success envelope per tool with default args
agent/examples/README.md            # generated index
```

`--check` recomputes and exits `1` on any missing/stale byte. Run it twice ⇒ identical bytes.
`agent/examples/manifest.json` is the "read me first" artifact for an agent without a server.

---

## 11. File ownership (agent team)

| Owner | Files (only these) |
|---|---|
| Lead | `docs/AGENT-INTERFACE.md`, `js/engine.js`, `js/presets.js`, `js/agent-core.js`, `scripts/gen-agent-artifacts.mjs`, `tests/*` |
| ui-bridge | `index.html`, `css/styles.css`, `js/agent-bridge.js`, `js/app.js` |
| node-transports | `agent/cli.mjs`, `agent/mcp-server.mjs`, `agent/selftest.mjs`, `package.json` |
| docs | `AGENTS.md`, `llms.txt`, `README.md`, `docs/ECOSYSTEM-MAP.md` |
| verifier | `agent/verify-browser.mjs`, `agent/verify-static.mjs`, `docs/AGENT-SCREENSHOTS.md`, `docs/agent/*.png` |

The verifier **reports** defects, never patches code it verifies. Shared generated artifacts
(`agent/manifest.json`, `agent/examples/*`) are written only by the generator (Lead/transports run it).

---

## 12. Acceptance checks

```powershell
node --test                                      # unit: engine vectors, registry, deeplinks, artifacts
node scripts/gen-agent-artifacts.mjs --check     # generated artifacts current + idempotent
node agent/selftest.mjs                          # CLI + MCP + canonical vectors (17+ checks)
node agent/verify-static.mjs --base http://127.0.0.1:8080/   # served paths, dump-dom state, manifest bytes
node agent/verify-browser.mjs --base http://127.0.0.1:8080/  # CDP checklist (events, setters, reload)
```

Note: `node --test` uses Node's test-file auto-discovery (`tests/*.test.mjs`); on Node 24 a bare
directory argument (`node --test tests/`) is treated as a module path, so use auto-discovery or
an explicit glob (`node --test "tests/**/*.test.mjs"`).

Baseline before this work: `?static` renders with `window.__agree === true`, no console errors,
default preset 12. These must still hold.

Browser checklist that must pass (verifier derives expectations from the registry, not the page):
URL round-trip/reload reproducibility (twice), readiness marker, hidden state JSON === `getState()`,
setter error envelopes, no-op emits zero events, exactly one mount event, subscribe semantics,
step/clamp behaviour, agent-tab panel contents + clipboard prompt text, layout at two widths.
