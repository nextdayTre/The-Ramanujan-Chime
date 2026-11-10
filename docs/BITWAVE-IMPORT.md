# BitWave import → Ramanujan Sphere display

**Status:** first slice **implemented** (2026-11-10). The read-only projection, the standalone
viewer and the independent verification harness exist in this repo. It is deliberately **not**
integrated into the instrument (no dock tab/preset) and **not** exposed as an agent tool or a
manifest/ecosystem link yet: the spike proves the display before any host decision.

## The decision

Keep the two tools single-purpose and connect them **one way, read-only**:

```
BitWave (authoritative, interactive)                Ramanujan Sphere (display sink)
  registers · lanes · ops · routes · LFO        →     parse save/link → render frames
  .bitwave project JSON (schema 1–3)                  no editing, no routing GUI, no engine port
  #bw=<base64url(JSON)> share link
```

- BitWave stays the **interactive tool**: register editing, ops, the six-row source table, LFO,
  Record, projects and share links are all its job.
- The Ramanujan Sphere becomes a **viewer** of a BitWave snapshot: it imports a `.bitwave`
  project document (or a BitWave share link), extracts the frames, and draws them in the sphere
  visual language. It does **not** own or re-implement BitWave semantics.
- No routing UI in the sphere. No round-trip. If the user wants to change something, they edit in
  BitWave, save/share, and re-import.

This removes the two hard parts of the earlier idea: no duplicated register/routing core, and no
bidirectional state contract. The only new shared surface is a **read-only data projection**.

## What shipped (2026-11-10)

| path | role |
|---|---|
| [`js/bitwave-import.js`](../js/bitwave-import.js) | the one DOM-free projection of a `.bitwave` document / `#bw=` link to frames. Dual export exactly like `js/engine.js`: browser `<script>` → `window.Harmony.BitWaveImport`, Node `require()` → the same functions. No DOM, no `eval`, no `Function`, no dependencies. |
| [`tests/bitwave-import.test.mjs`](../tests/bitwave-import.test.mjs) | canonical-vector, schema 1/2/3 acceptance, schema >3 refusal, width, share-codec, route/parked validation, `add`/`sub` wrap, expression-as-text and determinism tests. |
| [`spike/bitwave-viewer.html`](../spike/bitwave-viewer.html) | standalone read-only viewer: paste box, file picker, drag-drop, `#bw=` auto-import, three lane z-stacks (9 plates) in the hollow-sphere language. Works from `file://` and served; no network. |
| [`spike/fixtures/`](../spike/fixtures/) | three real BitWave examples copied verbatim (`demo` schema 2/64-bit, `glv-3phase-orbit` schema 3/256-bit, `rallentando-drift-n32` schema 3/32-bit) plus an authored canonical-vectors fixture. |
| [`spike/verify-bitwave-viewer.mjs`](../spike/verify-bitwave-viewer.mjs) | independent, zero-dependency CDP verifier: drives headless Chrome over `file://` **and** a temporary served root, captures screenshots, compares the rendered frames to Node's own projection. |
| `spike/shots/16–18-*.png` | reproducible reference captures (canonical 64-bit, 256-bit, schema-refused error state). |

Commands (repository root):

```powershell
node --test tests/bitwave-import.test.mjs     # projection + canonical vectors
node spike/verify-bitwave-viewer.mjs          # CDP gate (file:// + served), no screenshots
node spike/verify-bitwave-viewer.mjs --capture # ... and write spike/shots/16–18
```

Open `spike/bitwave-viewer.html` directly (double-click / `file://`) or serve the repo and open
`/spike/bitwave-viewer.html`. The page loads the canonical fixture by default; paste a document
or a link, drop a file, or append `#bw=<payload>` to import a snapshot.

## The projection — `bitwaveImport(input, opts)`

Input is either:

1. a raw `.bitwave` JSON document (string or object), or
2. a BitWave share link/URL whose `#bw=` fragment is `unpadded base64url(UTF-8 JSON)` —
   parsed locally, no network, or a bare `bw=` / bare base64url payload.

Output (the only data the viewer needs):

```
{
  ok: true,
  importSchemaVersion: 1,          // projection schema
  schemaVersion: 1 | 2 | 3,        // BitWave project schema
  width: 8 | 16 | 32 | 64 | 128 | 256,
  lanes: [{
    id: 1 | 2 | 3, op, opSymbol,
    labels: { a, b, z },           // global frame names: A/B/Z1, C/D/Z2, E/F/Z3
    frames: { a, b, z },           // { key, label, hex, nibbles, popcount }
    focus, frameVis,
    sources: { a, b }, driven: { a, b },
    expressions: { a, b },          // text only — never evaluated
    truthCounts: [n00, n01, n10, n11]
  }],
  focus: { lane: 1 | 2 | 3, frame, label },
  view: '2d' | '3d' | 'split',      // provenance only; the viewer chooses its layout
  routes: [{ from, to, mix }],
  provenance: { source: 'file' | 'link', name?, savedAt? },
  warnings: []
}
```

Failure shape: `{ ok: false, importSchemaVersion: 1, error: { code, message, hint? } }` with a
closed code set: `E_BITWAVE_INPUT`, `E_BITWAVE_JSON`, `E_BITWAVE_SHARE`, `E_BITWAVE_SCHEMA`,
`E_BITWAVE_WIDTH`, `E_BITWAVE_PROJECT`. It never throws.

Rules as implemented:

- **Never evaluate anything.** `expressions` are schema-3 text, displayed verbatim; there is no
  `eval`/`Function`. `Z` is the only computed value: stored `A <op> B` per lane (bitwise, or
  BigInt `add`/`sub` wrapping mod 2^N) — the project stores A/B only, so this is the one
  unavoidable derivation and it matches BitWave's `derive.ts`.
- **Validate width** against the documented set (`8/16/32/64/128/256`); a width outside it is
  `E_BITWAVE_WIDTH`. Unknown/newer schemas are refused with a clear message
  ("BitWave schema 4 is not supported by this viewer; update the viewer or re-save as schema 3").
- **Schema 1 fields are validated as BitWave validates them** (`app`, `N`, `lanes.*.a/b`,
  `showB`, `binop`, `colA/colB`, route ports, one route per destination, parked bases); schema-2/3
  additive fields (`focus`, `frameVis`, `lfoMode/Rate`, `expressions`) are lenient, exactly as in
  `project.ts`. `dataset` is used only to label operand sources; it is **not rendered**.
  `savedAt` and the transient log are **not rendered** — the viewer is a snapshot view.
- `sources`/`driven` mirror BitWave's own `buildUiState` semantics: a dataset column binding
  first, then a routed frame source (with its mix), then `stored`; `driven` is true when a route
  drives the operand.
- **Canonical vectors** (BitWave `AGENTS.md`, also in `design-invariants`):
  `A=8ADEFEDA85210125`, `B=FFFFFFFF00000000`, `Z1 = A ⊕ B = 7521012585210125` (popcount 20,
  truth counts `23 11 9 21`). `spike/fixtures/canonical-vectors.bitwave.json` is the authored
  fixture that exercises them.
- Provenance is shown in the UI (e.g. "BitWave import · schema 3 · 64-bit · read-only").

## The viewer

- **Layout:** three lane z-stacks inside the vessel — stack 1 = lane 1 (A/Z1/B), stack 2 = lane 2
  (C/Z2/D), stack 3 = lane 3 (E/Z3/F). Each frame is a plate; the waveform is a monotone-cubic
  nibble spline (BitWave's shape rule); the lane op and global frame labels are shown; the
  project's focused frame gets the gold accent; frames hidden by `frameVis` are ghosted.
- **Quiet by default.** No breathing, no auto-rotate, no scanning unless the scan switch is on.
  Scan adds a slow scan line and a subtle vessel breath only while enabled.
- Dense widths (128/256) drop the nibble dots/ticks to stay readable.
- **Machine contract** (used by the verifier): `body[data-bitwave-viewer-ready="true"]`, the
  hidden `#bitwave-viewer-state` JSON, `window.bitwaveViewer.getState()/importInput()/
  loadCanonical()/clear()/setScan()`, `#provenance`, `#status`, and the inspector's
  `[data-bitwave-frame="1.A"][data-hex]` hooks.

## Verification (canonical vectors)

```powershell
node --test tests/bitwave-import.test.mjs
node spike/verify-bitwave-viewer.mjs --capture
```

The verifier derives every expected value in Node from `js/bitwave-import.js` and
`spike/fixtures/*.json` — never from the page under test — and checks, in headless Chrome:

- default canonical fixture and a canonical `#bw=` link render lane 1 as
  `8ADEFEDA85210125 / FFFFFFFF00000000 / 7521012585210125` (popcount 20, truth counts
  `23 11 9 21`, focus `Z1`), with provenance "schema 3 · 64-bit · read-only";
- the 256-bit `glv-3phase-orbit` fixture imports and matches Node exactly;
- schema 4 is refused with `E_BITWAVE_SCHEMA`, bad `#bw=` payloads with `E_BITWAVE_SHARE`, and
  the page stays alive/ready with no console errors;
- the paste/API path imports, errors and recovers (`loadCanonical()`), and reloads are
  state-deterministic;
- `file://` and served mode both work, and the `--capture` screenshots are non-blank (>50 KB).

## Suggested first slice — delivered

1. **Fixtures** — three real `.bitwave` examples copied verbatim into `spike/fixtures/`, plus an
   authored canonical-vectors document; no network dependency. ✅
2. **`bitwaveImport()` + tests** — schema 1/2/3 accepted, schema >3 refused, bad base64 refused,
   width validation, canonical vectors exact. ✅
3. **`spike/bitwave-viewer.html`** — paste box + file drop + `#bw=` import, read-only render,
   no instrument changes; verified `file://` and served, no console errors. ✅
4. **Integrate as a dock tab/preset and expose a pure `bitwave_import` tool** through the agent
   layer (manifest + CLI + deeplink) — **not done**; deliberately deferred until the display has
   been judged. The projection is already DOM-free and dual-exported, so this is an additive
   step (and would be the first place to add a `relatedTools`/ecosystem claim, after it ships
   and is tested).

## Non-goals (deliberately)

- Routing GUI in the sphere; frame→sphere parameter routing; LFO/expression simulation.
- Bidirectional sync or live iframe/postMessage coupling (possible later; not needed for display).
- Porting BitWave's core into `js/engine.js`, or porting the sphere into BitWave. (The viewer
  derives `Z` only; it does not re-simulate routes, LFO or expressions.)
- Claiming the link in the agent manifest/ecosystem map until it actually ships and is tested
  (both projects' "no invented links" rule).

## Reference points

- BitWave: `AGENTS.md` (three surfaces, `.bitwave` schema 3, `#bw=` codec, canonical vectors),
  `docs/AGENT-INTERFACE.md`, `src/core/project.ts`, `src/core/share.ts`,
  `src/core/agent-state.ts`, `examples/` (local checkout at
  `C:\Users\trevor\Documents\BitWave`; not a runtime dependency — fixtures are copied).
- This repo: `js/bitwave-import.js`, `spike/bitwave-viewer.html`,
  [`spike/bitwave-routing.html`](../spike/bitwave-routing.html) (plate/z-stack renderer language
  reused), [`spike/README.md`](../spike/README.md), [`docs/ECOSYSTEM-MAP.md`](./ECOSYSTEM-MAP.md)
  (how to describe the link honestly), [`js/agent-core.js`](../js/agent-core.js) (where a
  `bitwave_import` tool would live later — not implemented in this slice).
