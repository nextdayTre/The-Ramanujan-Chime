# Agent Screenshots — reproducible reference views

Reference PNGs for the agent layer of **Ramanujan's Compassion**
(`ramanujan-sphere`, schema 1, toolset 1.0.0). Every image is produced from a
**canonical `?static=1` deeplink** by `agent/verify-browser.mjs --capture`, so the
same link always renders the same state (contract §4.2). The harness also runs the
full 58-check browser checklist before capturing; a capture only happens on a page
that reached `body[data-agent-ready="true"]` with no console errors.

| | |
|---|---|
| Server | `http://127.0.0.1:8080/` (`python -m http.server 8080 --bind 127.0.0.1` from the repo root) |
| Chrome | `C:\Program Files\Google\Chrome\Application\chrome.exe` (`--headless=new`, fresh profile per run) |
| Driver | `node agent/verify-browser.mjs --base http://127.0.0.1:8080/ --capture` (zero deps, Chrome DevTools Protocol over Node's global `WebSocket`) |
| Viewport | `1600x1000` for the instrument views, `1600x1400` for the tall Agent-tab shot |
| Mode | `static=1` on every link (transport frozen, camera orbit off) |

## 1. Files

| File | Deeplink (append to `http://127.0.0.1:8080/`) | Viewport | Bytes | SHA-256 (PNG) |
|---|---|---|---|---|
| `docs/agent/01-default-scopes.png` | `?static=1` | 1600×1000 | 707 858 | `6cfe74752f21da8550d3ecd2a1488d534f361b4808511ba279ddae340e5401cb` |
| `docs/agent/02-harmonics.png` | `?preset=12&tab=harmonics&static=1` | 1600×1000 | 704 017 | `217a9dc37425cc3003155f14d9490038a4219f31f2d33df18b459fde7d970aa2` |
| `docs/agent/03-bits.png` | `?tab=bits&static=1` | 1600×1000 | 690 592 | `c20bb15a619518a39c027f3d5b641f7e0057cb823a97a5317557c41ce7cf5987` |
| `docs/agent/04-agent-tab.png` | `?tab=agent&static=1` | 1600×1400 | 996 899 | `374ce834d49131389b8f9865a50f4a5fec847be369485797e4179b2adac76f57` |

All four are > 50 KB (checked by the harness) and were visually inspected.

What each image proves:

- **01 default scopes** — the default view is unchanged: preset 12
  (`Four-Bit Orbit — 1000 (8) ↔ 0001 (1) Palindrome & Quadray`), `scopes` tab,
  shell `R=1.00 r=0.45`, `Shell Vol 3.81`, Quadray tetrahedron labels, the two
  scopes. The **only** structural delta vs the pre-agentify baseline is the fifth
  dock tab (`5 · Agent`, §4).
- **02 harmonics** — `preset=12&tab=harmonics` renders the Ramanujan spectrum and
  the `1/π` convergence chart (`π_f32 = 0x40490FDB`); the deeplink applies preset
  index 12 and switches the dock pane.
- **03 bits** — Float32 Bit Lab at playhead 0: `x = 1 → 0x3F800000`,
  `y = -0 → 0x80000000`, `z = 0 → 0x00000000`, matching `bit_inspect` headlessly.
- **04 agent tab** — the agent layer's human surface: `bridge-active` badge, the
  current deeplink, the copyable handoff prompt, live UI-state JSON (scrollable),
  the 9-tool catalogue (canonical order) and links to `AGENTS.md`,
  `docs/AGENT-INTERFACE.md`, `agent/manifest.json`. The Agent dock is 344 px on
  this tab only; the other four tabs keep the 228 px dock.

## 2. Recapture

Run from the repository root with the static server already running:

```powershell
node agent/verify-browser.mjs --base http://127.0.0.1:8080/ --capture
```

This re-runs the full browser checklist (58 checks), then writes the four PNGs
above into `docs/agent/`, verifying each is > 50 KB. Exit code `0` iff every
check passed **and** every capture succeeded. A failing capture prints `FAIL
capture docs/agent/<file>` with the byte count.

Minimal single-image recipe without the harness (Windows PowerShell — the fresh
`--user-data-dir` and `Start-Process -Wait` are required; a running Chrome session
otherwise swallows the invocation and writes nothing):

```powershell
$chrome  = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$profile = Join-Path $env:TEMP ('rs-shot-' + [guid]::NewGuid().ToString('N'))
$out     = Join-Path (Get-Location) 'docs\agent\01-default-scopes.png'
$args = @(
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  "--user-data-dir=$profile", '--virtual-time-budget=8000', '--hide-scrollbars',
  '--window-size=1600,1000', "--screenshot=$out",
  'http://127.0.0.1:8080/?static=1'
)
Start-Process -FilePath $chrome -ArgumentList $args -Wait -PassThru | Out-Null
# kill only processes that belong to this temp profile, then remove it
Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  Where-Object { $_.CommandLine -like "*$profile*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Remove-Item -Recurse -Force $profile -ErrorAction SilentlyContinue
Get-Item $out | Select-Object Name, Length   # expect > 50 KB
```

Before trusting a recapture, assert the state contract for each link (the harness
does this automatically):

```powershell
node agent/verify-static.mjs --base http://127.0.0.1:8080/
# dump-dom: body[data-agent-ready="true"], #ramanujan-sphere-state deep-equals
# the Node registry projection for ?static=1, ?tab=bits&static=1, ?preset=5&tab=harmonics&static=1
```

To compare pixels, hash the PNGs (`Get-FileHash docs\agent\*.png -Algorithm
SHA256`). The PNG bytes are only guaranteed stable for a fixed Chrome build,
platform and window size; the **state** is what the contract pins
(`getDeeplink()` opened twice ⇒ byte-identical `getState()` — checked by
`agent/verify-browser.mjs` F2).

## 3. Baseline comparison (agent layer is additive)

Pre-agentify reference screenshots for the same views exist at
`C:\Users\trevor\AppData\Local\Temp\rs-baseline\`:

| Baseline (pre-agentify) | Comparable view here |
|---|---|
| `baseline-default.png` | `01-default-scopes.png` |
| `baseline-harmonics.png` | `02-harmonics.png` |
| `baseline-frobenius.png` | (frobenius tab — not re-captured; unchanged code path) |

The baselines were captured at **1584×905**, the references here at **1600×1000**,
so their pixel dimensions and cropped proportions differ; compare layout and
content, not raw pixels. The **only intended default-view delta** is the fifth
dock tab (`5 · Agent`) and the extra dock height on the Agent tab only
(344 px vs 228 px). The default preset, maths, 3D scene, scopes, HUD, telemetry
strip and the four original tabs are unchanged.

## 4. Documented limitations (not defects)

- **Headless clipboard.** Reading the clipboard over CDP is blocked in headless
  Chrome, so the browser harness stubs `navigator.clipboard.writeText` and verifies
  the **copied text** that the bridge hands to the clipboard API for all three copy
  buttons (deeplink, handoff prompt, state JSON). On a real desktop browser the
  same text is copied; if the clipboard permission is denied, the Agent panel
  falls back to showing the plain text in `<pre>` elements (contract §2.2).
- **PNG byte-stability.** The screenshot *state* is deterministic; the PNG *bytes*
  depend on the Chrome version and software rasteriser. Recapture commands are
  provided above; `docs/agent/*.png` are reference images, not a CI byte gate.
- **Static server content types.** Some Python/Windows `http.server` builds serve
  `.md` as `application/octet-stream` (no `.md` mapping in the Windows registry).
  `agent/verify-static.mjs` accepts that and verifies the content markers instead;
  it is a server trait, not a repo defect.
- **Viewport.** The `1600x1400` Agent shot is intentionally taller than the
  instrument's normal 1600×1000 view so all three dock cards are fully visible in
  one image; the layout itself is the same zero-scroll 100dvh shell.
- **Screenshots are not part of `node --test`.** They are produced by
  `agent/verify-browser.mjs --capture` (the browser-level gate) and inspected
  manually; the static battery does not launch Chrome.
