# Ecosystem map — Ramanujan's Compassion

This is the honest map of the tools that surround this instrument and the data that could
cross between them. It is deliberately conservative: **status `available` means the thing
exists and was exercised in this shipped tree**; **status `reference` means a file exists
only in the local, gitignored archive on this machine — it is not part of this repository,
not served by this app, and not linked at runtime**; **status `planned` means designed but
not implemented**.

Related, machine-readable counterpart: the `relatedTools[]` array inside
[`agent/manifest.json`](../agent/manifest.json) (generated from
[`js/agent-core.js`](../js/agent-core.js), contract in
[`docs/AGENT-INTERFACE.md`](./AGENT-INTERFACE.md) §7). This document is the human-readable
companion; never treat a row marked `planned` as a working link.

---

## 1. What this repo exposes today

All four surfaces are wrappers over one shared module — `js/engine.js` for the maths and
`js/agent-core.js` for the agent registry/state projections. The same nine pure tools are
reachable from the page, the CLI and the MCP server.

| Surface | Entry point | Handoff payload | Status |
|---|---|---|---|
| Deeplink + static state | `http://127.0.0.1:8080/?preset=12&tab=bits&static=1` and `#ramanujan-sphere-state` | The full UI-state object ([`docs/AGENT-INTERFACE.md`](./AGENT-INTERFACE.md) §5) | available |
| In-page bridge | `window.ramanujanSphere` | Same state object; setters change the live view; `call()` returns envelopes | available |
| CLI (JSON) | `node agent/cli.mjs <tool> --json` | Success/failure envelopes (§3) — exactly what the browser registry returns | available |
| MCP stdio server | `node agent/mcp-server.mjs` (newline JSON-RPC 2.0) | `tools/list` + `tools/call` envelopes | available |
| Generated manifest | `agent/manifest.json` (byte-equal to `getManifest()`) | Identity, deeplink defaults, UI selectors, tool catalogue, preset catalogue, `relatedTools` | available |
| Generated examples | `agent/examples/<tool>.json` | One default-args success envelope per tool + `agent/examples/README.md` | available |

These are the handoff points other tools can consume **today**. Everything in §2 is a
local reference archive, not a wired-up peer.

---

## 2. Sibling tools in the local archive

[`SchoolOfTomorrow/`](../SchoolOfTomorrow/) is a local, **gitignored** copy of the
4D Solutions "School of Tomorrow" archive (Kirby Urner; its own
`SchoolOfTomorrow/School_of_Tomorrow-master/README.md`). It is a reference library of quadray /
IVM / synergetics material. Its files are **not** part of this repo, are **not** served by
the instrument, and are **not** reachable through any of the surfaces above. Paths below are
filesystem paths on this machine only — they resolve locally (relative to the repo root) and
would 404 from a clean clone.

### 2.1 The machine seed: `relatedTools[]` in the manifest

`getManifest().relatedTools` (and therefore [`agent/manifest.json`](../agent/manifest.json))
currently carries five entries. Every one is `status: "available"`, which in v1 means
**"the local reference file exists"** — not "a live link works". The manifest is the
machine-readable seed; this document is the human-readable expansion.

| `id` | `title` (exact manifest string) | `path` | relationship (manifest summary) |
|---|---|---|---|
| `quadcraft2` | QuadCraft 2 — Quadray 3D explorer (local reference archive) | `SchoolOfTomorrow/School_of_Tomorrow-master/QuadCraft2.html` | shares the Quadray tetrahedral basis; its `(1,0,0,0)…(0,0,0,1)` vectors are `fourbit_orbit.quadray`; local untracked archive, not a live link |
| `quadraygrid4` | QuadrayGrid4 — quadray grid renderer (local reference archive) | `SchoolOfTomorrow/School_of_Tomorrow-master/QuadrayGrid4.html` | same quadray lattice coordinates; candidate future query-param handoff receiver |
| `flextegrity-lattice` | Flextegrity Lattice — IVM/CCP lattice viewer (local reference archive) | `SchoolOfTomorrow/School_of_Tomorrow-master/Flextegrity_Lattice.html` | IVM/CCP sphere-packing context for the hollow-sphere carrier; no data handoff yet |
| `quadrays-research` | Quadrays Research notebook (local reference archive) | `SchoolOfTomorrow/School_of_Tomorrow-master/QuadraysResearch.ipynb` | derivation source for the quadray ↔ XYZ mapping; manual handoff only |
| `qrays-py` | qrays.py — quadray Python module (local reference archive) | `SchoolOfTomorrow/School_of_Tomorrow-master/qrays.py` | Python quadray math counterpart; CLI/MCP could eventually emit compatible vectors |

The rest of the archive below is documented for orientation but is **not** in
`relatedTools` (the manifest deliberately keeps only the closest handoff candidates).

| Local file (under `SchoolOfTomorrow/School_of_Tomorrow-master/`) | What it is / does | Handoff relevance to this instrument | Status |
|---|---|---|---|
| `QuadCraft2.html` | Self-contained three.js quadray grid sandbox. Keyboard/button movement of a selected Quadray "dot"; toggles octahedra and paired tetrahedra to fill CCP space; quicksave to `localStorage` or a downloaded JSON file; an `eval` text box for grid queries. | The closest sibling: it already stores an exact `{a,b,c,d}` snapshot (schema below). A payload bridge from its saved JSON to the Four-Bit Orbit labels would be a real handoff; none is implemented. | reference |
| `QuadrayGrid4.html` | Earlier/sibling quadray-grid sandbox on the same code lineage: flashing selected Quadray (`selq`), example-code buttons, quicksave/quickload slots 1–9, file save/load, camera + build state in JSON. | Same `quadcraft_quadraygrid4_state` JSON shape and the same `Quadray` class (`toCartesian`, `fromRawCartesian`, `normalized`). This is the natural receiver for a future `?qray=` deeplink. | reference |
| `Flextegrity_Lattice.html` | Static nbconvert-style export of `Flextegrity_Lattice.ipynb` (not an interactive app): a Python framework that stores geometry and writes POV-Ray SDL, using a CCP lattice of balls as the "holodeck" for Sam Lanahan's Flextegrity tension-compression lattice. | Visual/numeric lineage for CCP ball packing and the rhombic-dodecahedron contacts; no interchange format with this instrument. | reference |
| `QuadraysResearch.ipynb` | Research notebook around quadray coordinates: pentagonal dodecahedron constructions, IVM/XYZ comparisons, quadray links. | Documents the same four basis labels `(1,0,0,0) … (0,0,0,1)` that the Four-Bit Orbit maps to `1000 / 0100 / 0010 / 0001`. | reference |
| `Mapping_Quadrays.ipynb` | Notebook explicitly mapping BRYG (quadray) ↔ XYZ ↔ IVM, including the `xyz_ivm_spokes.gif` animation. | The conversion formulas that any future importer/exporter must match; see §3. | reference |
| `qrays.py` | Canonical Python implementation of quadray/IVM vectors (`Qvector`, `Vector`, `Svector`) with 2-way conversion, normalization (subtract the min term), lengths, angles, rotations, cross/area; MIT-licensed, K. Urner. | The authoritative definitions of the quadray basis used across the archive. Its basis-to-Cartesian mapping is quoted in §3; it differs from this instrument's vertex placement, so a coordinate copy is *not* a valid handoff. | reference |
| `QuadCraft_Project.ipynb` | Project hub / "Hall of Fame" notebook: collects quadray and IVM implementations and links, explains the project's criteria. | Reference index only — no data payload. | reference |
| `ivm_balls.py`, `ivm_tetra_edges.py` | Python helpers: generate FCC/CCP sphere centers layer by layer from quadray spokes (`permutations((2,1,1,0))`), and OEIS-verified contact-point counts. | Source for the CCP ball-pack imagery and counting sequences; no interchange with this instrument. | reference |
| `tetravolume.py`, `Qvolume.ipynb`, `flextegrity.py`, `flex_scripts*.py` | Deeper geometry/volume and POV-Ray scene pipelines in the same archive. | Background only. | reference |
| IVM/CCP imagery: `ccp_ball.gif`, `ccp_grow.gif`, `ccp_rds.gif`, `four_ivms.gif`, `xyz_ivm_spokes.gif`, `rhombic_dodeca_ccp_ball.png`, `sphere_pack.png`, `smaller_sphere_pack.png`, `cubocta.png`, `jitterbug.png`, `3rd_powering.png`, `qc1.png`, `qtet.png` | Animated/static illustrations of CCP ball packing, cuboctahedron/jitterbug, and the four IVM units. | Illustrative analogy for the hollow sphere vessel and cavity; **no numeric handoff** (they are images). | reference |

---

## 3. Exact handoff data

### 3.1 Quadray tetrahedron ↔ `fourBitOrbit.quadray`

This instrument's single source of truth (`js/engine.js`, `Engine.fourBitOrbit`) places the
four Quadray basis directions **as tetrahedron vertices on the outer sphere of radius R**,
labelled with the 4-bit values used by the Four-Bit Orbit. For `R = 1`, `playT = 0`
(float32 values as returned by the `fourbit_orbit` tool):

| label | 4-bit | decimal | x | y | z |
|---|---|---|---|---|---|
| `(0,0,0,1)` (`D`) | `0001` | 1 | `0` | `1` | `0` |
| `(1,0,0,0)` (`A`) | `1000` | 8 | `0` | `-0.33333334` | `0.94280905` |
| `(0,1,0,0)` (`B`) | `0100` | 4 | `-0.81649661` | `-0.33333334` | `-0.47140452` |
| `(0,0,1,0)` (`C`) | `0010` | 2 | `0.81649661` | `-0.33333334` | `-0.47140452` |

The archive's `qrays.py` uses the same four basis labels but a different convention: for
`DIAM = 1`, `A = (1,0,0,0)` maps to `xyz = (√2/4, √2/4, √2/4)`, `B = (0,1,0,0)` to
`(-√2/4, -√2/4, √2/4)`, `C = (0,0,1,0)` to `(-√2/4, √2/4, -√2/4)`, `D = (0,0,0,1)` to
`(√2/4, -√2/4, -√2/4)`; each basis vector has length `√6/4` and adjacent bases meet at
`109.471220634491°`. The raw Cartesian form used by the QuadCraft HTML files is
`x = a - b - c + d`, `y = a - b + c - d`, `z = a + b - c - d`, then divided by `√2` for
"Cartesian" units.

**Consequence:** the two systems share the combinatorial object (a regular tetrahedron plus
the `0001/0010/0100/1000` labels) but differ by a rotation/permutation and by a scale
(radius-normalised vertices here vs. unit-edge IVM basis there). There is **no implemented
transform** in v1 — do not copy `xyz` values between the tools and expect a match. A future
phase would publish an explicit basis transform.

### 3.2 4-bit nibble

`fourBitOrbit` also reports the current nibble on the vertical orbit: at `playT = 0` it is
`{ "val": 8, "bin": "1000", "hex": "0x8" }`; the top pole is `1111` (`0xF`, decimal 15) and
the bottom pole is `0000` (0). No sibling tool consumes this nibble today; it is available
through the `fourbit_orbit` tool and the deeplink `pt` parameter.

### 3.3 QuadCraft save payload

Both QuadCraft HTML files save JSON under the key `quadcraft.quicksave.<slot>` with
`type: "quadcraft_quadraygrid4_state"` and at least:

```json
{ "type": "quadcraft_quadraygrid4_state",
  "selq": [a, b, c, d],
  "camera": { "offsetX": 0, "offsetY": 0, "zoom": 1, "angleX": 0, "angleY": 0 },
  "camPos": [x, y, z], "camQ": [x, y, z, w],
  "textBoxToEval": "…",
  "grid": { "<brush name>": [[a, b, c, d], "…"] },
  "ccp": { "…": [ … ] },
  "chk": { "<checkbox id>": true },
  "selectBrushNames": ["…"],
  "V": { "…": "…" }
}
```

`selq` and every `grid` entry are IVM quadray coordinates — the exact numbers a future
`?qray=` receiver would need. This schema was read from the shipped archive file; the
archive itself has **no URL/query-param input** (it persists only to `localStorage`/files),
so there is no live link today.

---

## 4. Phased plan

### Phase 1 — documented manifest (v1 — **now**)

- `agent/manifest.json` carries `relatedTools[]` entries
  `{ id, title, path, relationship, status }` for the local archive files listed above.
- This document is the prose companion, and both are regenerated/diffed by
  `node scripts/gen-agent-artifacts.mjs --check`.
- **No runtime calls cross a tool boundary.** `status: "available"` means only "the local
  reference file exists"; handoff remains documented-only.

### Phase 2 — live query-param handoff (**planned — not implemented**)

Design sketch (subject to a schema bump of the deeplink grammar):

- Receiving side: QuadCraft2/QuadrayGrid4 gain `?state=<url-encoded JSON>` (or
  `?qray=a,b,c,d&brush=<name>`) parsing on load; this instrument gains an exporter tool that
  emits such a URL.
- Sending side: a new pure tool (e.g. `quadcraft_handoff`) converts `fourBitOrbit.quadray`
  into a QuadCraft `selq`/`grid` payload with an explicit basis transform, and returns the
  receiver URL in the envelope's `deeplink` field.
- Acceptance before flipping any status: open the exported URL in a fresh browser profile,
  read the receiver's state back, and assert the round-trip equals the source values; record
  the transform in this file.

### Phase 3 — shared manifest (**planned — not implemented**)

- A small `agent/ecosystem.json` index (or an aggregating MCP server) that lists every
  sibling's `agent/manifest.json`-equivalent, so one client can discover and call several
  local tools.
- Requires Phase 2 handoffs to be live and each sibling to ship a contract of its own.
  Nothing in this phase exists yet; do not advertise an endpoint for it.

---

## 5. Cross-tool rules (keep the map honest)

1. A link, path or command may be documented only after it was executed successfully in this
   tree; record the command and its exit code.
2. `relatedTools[].status` and the tables above are the only claim of connectivity.
   `available` ≠ "live handoff". Use `planned` until a round-trip is verified.
3. The archive is gitignored reference material: never import it at runtime, never serve it,
   and never make the shipped page depend on it.
4. A handoff that changes a coordinate system must publish the exact transform (axis
   convention, scale, permutation) alongside the data.
