# Spike — standalone BitWave × Ramanujan prototypes

These pages are **experiments, not shipped features**. Nothing imports them, `index.html` does
not reference them, and the instrument's maths/rendering/default UX are unchanged. The verified
release artifact in this repo is the agent layer (commit `78386a9`, tag `agent-layer-v1.0.0`).

Open any page directly (`file://` works — classic scripts, no server needed) or serve the repo
root and browse `/spike/`.

## `spherical-harmonics.html` — Stage 4b-1 3D $Y_\ell^m$ heat/EQ shader & conductive wireframe

Standalone 3D WebGL R&D prototype driven by the pure Stage 4b-1 math in `js/engine.js`
(`sphericalHarmonicBasis25`, `sphericalHarmonicSpectrum`, `shellMultipoleTransfer`,
`createSphericalWireframeGraph`):

- **25-Band Real Spherical Harmonics GLSL Shader ($\ell = 0..4$):** Custom Three.js `ShaderMaterial`
  displacing both the inner cavity ($r$) and outer carrier ($R$) by singularity-free Cartesian
  $Y_\ell^m$ modes, including exact **Quadray octupole alignment** ($Y_3^{-2} \propto xyz$ peaking on
  the 4 inscribed tetrahedron vertices) and an interactive click/drag **25-Band Spherical EQ** (or
  live projection from any of the 13 built-in Chime presets).
- **Exact $\eta^\ell$ Hollow-Shell Angular Filter & Multipole Zoom-Unpack ($\sigma$):** Visualizes the
  potential-theory transfer factor $T_\ell(\eta) = (r/R)^\ell$ (`6ℓ dB/octave`) across the inner and
  outer shells alongside recursive Sentinel $\sigma$ zoom-unpacking ($2^{-3\sigma}$ volume scaling).
- **Graph Laplacian Conductive Wireframe ($\mathbf{L} = \mathbf{D} - \mathbf{A}$):** 162-vertex /
  480-edge subdivided icosphere supporting CFL-stable **Conductive Wave** and **Heat Diffusion** modes,
  inner↔outer radial osmosis struts, strictly passive $C^1$ wavefolding, Shift+Click 3D wave pings,
  and live Dirichlet surface-tension energy $\frac{1}{2}\mathbf{u}^\top\mathbf{L}\mathbf{u}$.

## `viscoelastic-slice.html` — Stage 4 viscoelastic cross-Chime 2D slice tank

Interactive R&D prototype driven by the pure Stage 4 math in `js/engine.js` (`sliceCalculus2D`,
`crossChimeSlice`, `createViscoelasticTank`, `pollardRhoSlice`):

- **Top XZ Viscoelastic Eikonal Floor (`y = 0`):** CFL-stable `float32` 2D damped/refractive wave
  tank bounded inside the circular slice $A = \pi(R^2 - r^2) = \frac{1}{4}(\partial_R + \partial_r)V$,
  where the inner cavity and outer shell act as a two-index medium ($c_{\text{in}}/c_{\text{out}} = \alpha = R/r$)
  with selectable **Osmosis (open absorbing)** vs. **Wavefold (reflective nonlinear)** rim and click/drag ripples.
- **Front $f(x)$ Cross-Chime Differential (`z = 0`):** Differentiates **Chime A** (`Front XY`)
  against **Chime B** (`Top XZ` slice) via `A + B`, `A − B Null` (with dBFS null meter and peak
  IEEE-754 hex), and `A · B̄` Conjugate Cross-Phase alongside live MiniMeters propagation velocity $\partial u/\partial t$.

## `bitwave-viewer.html` — read-only BitWave import viewer

The first shipped slice of [`docs/BITWAVE-IMPORT.md`](../docs/BITWAVE-IMPORT.md): import a
`.bitwave` project document (schema 1–3) or a BitWave `#bw=` share link, extract the frames with
the shared projection [`js/bitwave-import.js`](../js/bitwave-import.js), and draw them as three
lane z-stacks (nine plates) inside the hollow-sphere language.

- **Inputs:** paste a JSON document or a share link; pick or drag-drop a `.bitwave`/`.json` file;
  or append `#bw=<payload>` to the URL. Default load is the embedded canonical fixture;
  `?empty=1` starts empty.
- **Layout:** lane 1/2/3 side by side, each stack `A` (far) / `Z1` (middle) / `B` (near) — lane 2
  `C/D/Z2`, lane 3 `E/F/Z3`. Each frame is a plate with the monotone-cubic nibble spline; the
  project's focused frame is gold, `frameVis=false` plates are ghosted, dense 128/256-bit widths
  drop dots/ticks. The right inspector lists all nine frames with hex, popcount and source badges.
- **Quiet by default:** no breathing, no auto-rotate, no scanning; the **Scan** toggle adds a slow
  scan line and a subtle vessel breath only while on. Nothing is evaluated — expressions are text.
- **Machine contract:** `body[data-bitwave-viewer-ready="true"]`, hidden
  `#bitwave-viewer-state` JSON, `window.bitwaveViewer` (`getState`/`importInput`/`loadCanonical`/
  `clear`/`setScan`), `#provenance`, `#status`, and `[data-bitwave-frame="1.A"][data-hex]` hooks.
- **Canonical vectors:** `A=8ADEFEDA85210125`, `B=FFFFFFFF00000000`,
  `Z1=A⊕B=7521012585210125` (popcount 20, truth counts `23 11 9 21`), focus `Z1`.

Fixtures in [`fixtures/`](fixtures/) are copied verbatim from the sibling BitWave checkout
(`examples/*.bitwave.json`) plus an authored canonical-vectors document; they are read-only
inputs and nothing in the instrument imports or serves them.

Verification (zero-dependency CDP):

```powershell
node --test tests/bitwave-import.test.mjs        # projection + canonical vectors
node spike/verify-bitwave-viewer.mjs             # file:// + served gate
node spike/verify-bitwave-viewer.mjs --capture   # ... and write spike/shots/16–18
# or: npm run verify:viewer
```

## `bitwave-routing.html` — interactive v1 playground

The standalone test bed for **frame → frame and frame → sphere routing**, sized to be felt
rather than read about.

- One lane, three frames as z-depth planes: `A` (far), `Z1` (middle), `B` (near).
  Hard-coded BitWave canonical vectors: `A = 8ADEFEDA85210125`, `B = FFFFFFFF00000000`,
  `Z1 = A ⊕ B = 7521012585210125`.
- Clock: play/pause, step, reset, tick rate (`routes → LFO → derive Z` on ticks; never per frame).
- Data: 64-bit A/B hex fields, ops `AND/OR/XOR/ADD/SUB`.
- Routes:
  - `A ← Z1`, `B ← Z1` — one-tick `z⁻¹` delay; the driven hex field locks.
  - `R ←`, `cavity ←`, `spin ←` from `{—, A, B, Z1}` — the routed frame is read as a cyclic
    monotone-cubic wavetable at the continuously-scanning playhead `t`.
- LFO: `ROL A` / `ROL B` per tick.
- **Breath** toggle: on = quiet default (`R ≈ 1.60–1.70`, slow scan); off = still vessel.
- View: Iso / Front, Vessel on/off; drag-orbit, wheel-zoom.
- Keys: `space` play/pause, `n` step, `r` reset, `1` iso, `2` front.

Reproducible states via query params (all optional):
`?playing=0&t=0.30&ticks=6&op=xor&hexA=…&hexB=…&lfoA=1&breath=0&view=iso&vessel=0`
`routeA=Z1`, `routeB=Z1`, `routeR=Z1|A|B|none`, `routeCavity=…`, `routeSpin=…`.

Known limits: three planes inside one sphere overlap (near plane occludes the middle); values are
HUD-only (no nibble dragging); one lane only (no cross-lane routes); no persistence or BitWave
import yet.

## `golden-plate.html` — P1 golden rectangle probe

The earlier visual question: a golden rectangle inscribed in the R circle (diagonal `2R`,
corners on the great circle) carrying one 64-bit frame as a green monotone spline, plus an
A/Z/B golden-section stack preview. Kept as the visual north star reference.

## `shots/`

Reference screenshots. `01–06` belong to the golden-plate probe; `10–15` to the routing
playground (quiet default, feedback route, evolved ticks, still vessel, front view); `16–18` to
the import viewer (canonical 64-bit, 256-bit `glv` link, schema-4 refused error state) — captured
reproducibly by `node spike/verify-bitwave-viewer.mjs --capture`.

Known limits of the import viewer: it is a **snapshot view** (no routing/LFO/expression
simulation, no editing, no round-trip), it derives `Z` from the stored `A`/`B` only, and it is
not integrated as an instrument dock tab or an agent tool yet. BitWave remains the authoritative
editor.
