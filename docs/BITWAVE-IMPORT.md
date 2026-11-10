# BitWave import → Ramanujan Sphere display (design note for the next session)

**Status:** agreed direction, nothing implemented yet. No code in this repo reads or writes
BitWave data today; this note exists so a clean session can start with the decision already made.

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

## What `bitwave_import` is

A small, DOM-free projection (future `js/bitwave-import.js` or a section of the agent core):

```
bitwaveImport(input, opts) -> { ok, project, frames, warnings } | { ok:false, error }
```

Input is either:
1. a raw `.bitwave` JSON document (string/object), or
2. a BitWave share link/URL whose `#bw=` fragment is `unpadded base64url(UTF-8 JSON)` — parse the
   fragment locally, no network.

Output (the only data the viewer needs):

```
{
  schemaVersion: 1|2|3,     // refused if > 3 (read-only open not built)
  width: 8|16|32|64|128|256,
  lanes: [{ id: 1|2|3, op, frames: { A, B, Z }, sources, driven, expressions? }],
  focus: { lane, frame },
  view: '2d'|'3d',          // provenance only; the sphere chooses its own layout
  provenance: { source: 'file'|'link', savedAt?, name? }
}
```

Rules:

- **Never evaluate anything.** `expressions` are displayed as text, never `eval`/`Function`.
- Validate `width` against the documented set and refuse unknown/newer schemas with a clear
  message ("BitWave schema 4 is not supported by this viewer; update the viewer or re-save as 3").
- `savedAt`, dataset and transient log are **not** rendered; the viewer is a snapshot view.
- The exact BitWave project key names must be read from BitWave's `src/core/project.ts` /
  `src/core/share.ts` (schema 3) — do not invent a parallel schema. BitWave: toolset `1.1.0`,
  state schema `1`, `.bitwave` schema `3`.
- Provenance is shown in the UI (e.g. "BitWave import · schema 3 · 64-bit · read-only").

## Display mapping (start simple)

- A BitWave project is **3 lanes × 3 frames = up to 9 registers**, width 8–256 bits
  (2–64 nibbles). The sphere already has the z-plane plate language from the spike.
- **v1 viewer layout:** three z-stacks inside the vessel — stack 1 = lane 1 (A/Z1/B), stack 2 =
  lane 2 (C/D/Z2), stack 3 = lane 3 (E/F/Z3) — or a lane switcher with one stack if 3 reads too
  busy. Each frame is a plate; the waveform is the nibble spline (monotone cubic, same shape rule
  as BitWave); the project's op/focus labels are shown; the focused frame gets the accent.
- **Quiet by default.** No breathing unless a "scan" switch is on; the viewer is ambient, not a
  second instrument. Dense widths (128/256) may need fewer nibble dots/labels.
- Later: a "constellation" of 9 plates, or use the sphere's A/B/C slots as lane hosts. Not now.

## Suggested first slice (next session)

1. Get 2–3 real `.bitwave` example files / links from BitWave (`examples/*.bitwave.json`,
   `node agent/cli.mjs deeplink --project …`).
2. Write `bitwaveImport()` + tests: schema 1/2/3 accepted, schema > 3 refused, bad base64 refused,
   width validation, canonical BitWave vectors (`A=8ADEFEDA85210125`, `B=FFFFFFFF00000000`,
   `Z1=7521012585210125`) render exactly.
3. Build `spike/bitwave-viewer.html` first — paste box + file drop, read-only render, no
   instrument changes. Verify `file://` and served, no console errors.
4. Only if it feels right: integrate as a dock tab/preset in the instrument, and expose a pure
   `bitwave_import` tool through the existing agent layer (manifest + CLI + deeplink).

## Non-goals (deliberately)

- Routing GUI in the sphere; frame→sphere parameter routing; LFO/expression simulation.
- Bidirectional sync or live iframe/postMessage coupling (possible later; not needed for display).
- Porting BitWave's core into `js/engine.js`, or porting the sphere into BitWave.
- Claiming the link in the agent manifest/ecosystem map until it actually ships and is tested
  (both projects' "no invented links" rule).

## Reference points

- BitWave: `AGENTS.md` (three surfaces, `.bitwave` schema 3, `#bw=` codec, canonical vectors),
  `docs/AGENT-INTERFACE.md`, `src/core/project.ts`, `src/core/share.ts`, `examples/`.
- This repo: `spike/bitwave-routing.html` (plate/z-stack renderer language to reuse),
  `docs/ECOSYSTEM-MAP.md` (how to describe the link honestly once live), `js/agent-core.js`
  (where a `bitwave_import` tool would live later).
