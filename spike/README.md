# Spike — standalone BitWave × Ramanujan prototypes

These pages are **experiments, not shipped features**. Nothing imports them, `index.html` does
not reference them, and the instrument's maths/rendering/default UX are unchanged. The verified
release artifact in this repo is the agent layer (commit `78386a9`, tag `agent-layer-v1.0.0`).

Open either page directly (`file://` works — classic scripts, no server needed) or serve the
repo root and browse `/spike/`.

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
playground (quiet default, feedback route, evolved ticks, still vessel, front view).
