# Ramanujan Sphere × Harmony Engine

An interactive **3D spatial-synth visualizer and IEEE-754 `float32` mathematical laboratory** connecting **Srinivasa Ramanujan's 1914 series for $1/\pi$**, **quadrature sine/cosine synthesis**, **hollow-sphere carrier geometry**, **Morlet wavelets**, **Weierstrass fractals & elliptic curves**, and **finite-field cyclic order $N$ groups (`secp256k1`)**.

> **Core Mental Model (Audio DSP ↔ Geometry):**
> *The radius of the sphere is the sine wave.* A constant hollow sphere $V = \frac{4}{3}\pi(R^3 - r^3)$ acts as an unchanging 3D carrier vessel while internal harmonic states—2D $f(x)/x$ slices, 3D analytic wavelets, Lissajous knots, and discrete order-$N$ cyclic orbits—evolve inside its shell and cavity.

---

## Quick Start

Zero build tools, zero npm install, and 100% offline-ready:

1. **Direct launch:** Double-click `index.html` in any modern browser (Chrome, Edge, Firefox, Safari).
2. **Optional local server:**
   ```powershell
   npx serve .
   # or: python -m http.server 8080
   ```

All 3D dependencies (`vendor/three.min.js` and `vendor/OrbitControls.js`) are vendored locally so the instrument never breaks offline.

---

## Mathematical & Audio-DSP Pillars

Detailed proofs and derivations live in [`HARMONY_ENGINE.md`](./HARMONY_ENGINE.md).

### 1. Constant Hollow Sphere Vessel — $V = \frac{4}{3}\pi(R^3 - r^3)$
- **Outer Carrier ($R$)** bounds unit-amplitude quadrature oscillators ($x^2 + y^2 + z^2 = R^2$).
- **Inner Cavity ($r$)** defines a nested core (ideal for sub-carrier modulation or bounding a finite-field order-$N$ torus).
- **4-Zone Live Telemetry:** Every sample along the trajectory is vertex-colored and metered in real time as **On Sphere** ($|P| \approx R$), **In Shell** ($r < |P| < R$), **In Cavity** ($|P| < r$), or **Outside** ($|P| > R$, e.g., $\tan$ `#DIV/0!` sentinel explosions).
- **Cutaway Shell Mode (`C`):** Slices the upper hemisphere into gossamer wireframe to expose the glowing annular wall $\Delta r = R - r$ and inner red cavity bowl.

### 2. Two Distinct Twins: Antipodal ($-P$) vs. Conjugate ($\bar{P}$)
Audio engineering and complex analysis use two different symmetries that are separated explicitly in the **TWIN** selector:
- **Antipodal Twin $-P = (-x, -y, -z)$ (`−P Null`):** A 180° polarity flip on all axes. Summing $P + (-P) = 0$ is the classic mixing-console **phase-null test**.
- **Conjugate Twin $\bar{P} = (x, -y, z)$ (`P̄ Conj`):** Negates only the imaginary/quadrature $y$-axis. Summing $P + \bar{P} = (2x, 0, 2z)$ cancels the imaginary component and collapses onto the **Real Trace**—the exact mechanism behind Euler's $\cos\theta = \frac{1}{2}(e^{i\theta} + e^{-i\theta})$, analytic Morlet wavelets, short Weierstrass point negation $(x, y) + (x, -y) = \mathcal{O}$, and Frobenius trace point counting.

### 3. Inscribed 2D $f(x)/x$ Slice & Circular `float32` Zoom Lens (`Z`)
- Inside the 3D sphere at $z = 0$ sits an inscribed Cartesian $f(x)/x$ scope dial (`2D f(x) Grid`, `F` camera snap).
- Plot **Weierstrass's fractal** $W(x) = \sum_{k=0}^{K} a^k \cos(b^k \pi x)$, the **Short Weierstrass elliptic curve** $y^2 = x^3 + 7$ (`secp256k1`'s real slice), **Fourier odd-harmonic square waves**, or **2D Gabor/Morlet atoms** directly inside the sphere.
- Toggle the **Zoom Lens (`Z`)** to inspect fractal self-similarity or Gibbs ringing at **$4\times$ to $256\times$** magnification—genuinely re-evaluating `Harmony.engine` in `float32` inside the red callout ring rather than upscaling pixels.

### 4. Discrete Order $N$ Strobe (`N`) & Frobenius `secp256k1`
- **Order $N$ Strobe:** Quantizes any continuous curve into $N$ discrete group steps $P_0, P_1, \dots, P_{N-1}$ with generator hop stride $n$:
  - When **$\gcd(n, N) = 1$** (always true for **prime $N$**, cofactor $1$), generator chords visit all $N/N$ points before closing.
  - When **$\gcd(n, N) > 1$** (composite $N$), the orbit collapses into a smaller subgroup $N / \gcd(n, N)$, leaving inactive coset points dimmed.
- **Tab 3 — Frobenius & Hasse:** Computes exact 256-bit `BigInt` Lucas recurrences $S_k = \lambda^k + \bar{\lambda}^k$ for the real cryptographic curve **`secp256k1`**, demonstrating how conjugate phasors on the Hasse circle of radius $\sqrt{p}$ determine exact finite-field point counts $\#E(\mathbb{F}_{p^k}) = p^k + 1 - S_k$.

### 5. Ramanujan's 1914 $1/\pi$ Series & IEEE-754 `float32` Bit Lab
$$
\frac{1}{\pi} = \frac{2\sqrt{2}}{9801} \sum_{k=0}^{\infty} \frac{(4k)!\,(1103 + 26390k)}{(k!)^4\, 396^{4k}}
$$
- Standard 32-bit audio float (`float32`) has 24 significand bits (~**144.5 dB** dynamic range), representing $\pi$ as hex `0x40490FDB` (`3.14159274`).
- While Leibniz/Gregory Fourier series require **millions of harmonics** to lock 24 bits of $\pi$, Ramanujan's modular-form series drops **~208 dB (~8 decimal digits) per term**—locking all 32 bits of `0x40490FDB` on the **$k = 0$ fundamental alone** (inspectable bit-for-bit in **Tab 2** and **Tab 4**).

---

## VST-Style `A | B | C` Sphere Bank

Located at the top of the left Synth Rack, modeled after hardware/VST synthesizers and reference analyzers (e.g., FabFilter / Serum / Phase Plant):

- **`A` / `B` / `C` Slots:** Hold three independent sphere + patch snapshots (preset, custom formulas, $R$, cavity $r$, Order $N$, oscillator sliders, twin mode, cutaway, and lens settings). Pre-loaded out of the box with:
  - **Slot `A`:** *Great Circle — 90° Quadrature Carrier*
  - **Slot `B`:** *Analytic Morlet $\psi(t)$ — 3D Conjugate Helix* (Cutaway Shell)
  - **Slot `C`:** *Finite Field Torus Knot — Order $N=41$ Cavity*
- **Live Auto-Save:** Any slider or patch tweak automatically updates the active slot.
- **`Copy →`:** Click `Copy →`, then click a destination slot (`A`, `B`, or `C`) to clone your current patch so you can sculpt variations safely.
- **`Ghost` Reference Overlay (`G`):** Renders the previous/copied slot's curve as a subtle violet dashed reference trajectory simultaneously inside the **3D Hollow Sphere**, **2D Slice Scope**, and **Dual Oscilloscope**.
- **`Share Link`:** Encodes the active patch snapshot into a self-contained `#patch=...` URL hash.

---

## Studio Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `Space` | Play / Pause oscillator transport |
| `1` `2` `3` `4` | Switch bottom Studio Dock tabs (*Scopes*, *Harmonics & Ramanujan*, *Frobenius & Hasse*, *Float32 Bit Lab*) |
| `Alt+1` `Alt+2` `Alt+3` | Jump directly to Sphere Slot **A**, **B**, or **C** |
| `[` / `]` | Cycle backward / forward through Sphere Slots **A ↔ B ↔ C** |
| `G` | Toggle **Ghost** reference trajectory overlay across 3D & 2D scopes |
| `C` | Toggle **Cutaway Shell** ($V = \frac{4}{3}\pi(R^3 - r^3)$ cross-section) |
| `N` | Toggle **Discrete Order $N$ Strobe** |
| `Z` | Toggle **Circular `float32` Zoom Lens** |
| `F` | Snap 3D camera straight onto the internal **Front 2D $f(x)$** slice plane |
| `Double-click slider` | Reset any parameter slider to its preset default |

---

## Repository Structure

```text
Ramanujan Sphere/
├── index.html              # Zero-scroll 100dvh studio shell (Synth Rack + 3D Stage + 4-Tab Dock)
├── HARMONY_ENGINE.md       # Mathematical & DSP derivations (Phasors, Morlet, Frobenius, Float32)
├── README.md               # Quick start, feature guide, and keyboard shortcuts
├── docs/
│   └── ARCHITECTURE.md     # Module boundaries, Float32 contract, and bloat-free extension guide
├── css/
│   └── styles.css          # Dark hardware-synth theme & CSS custom properties
├── js/
│   ├── engine.js           # Single Source of Truth IEEE-754 float32 math & BigInt Frobenius core
│   ├── presets.js          # Curated 2D/3D spatial-synth, fractal, wavelet & finite-field patches
│   ├── scene3d.js          # Three.js Hollow Sphere, 2D z=0 slice grid, twins, ghost & Order N strobe
│   ├── magnifier2d.js      # Circular 4x–256x float32 re-sampling fractal/harmonic zoom lens
│   ├── lissajous2d.js      # 2D XY quadrature scope with offscreen cache, phosphor trail & strobe
│   ├── timeseries.js       # Dual-channel x(t) & y(t) oscilloscope with ±R / ±r rails & ghost trace
│   ├── harmonics2d.js      # Harmonic partial spectrum + Ramanujan 1/π vs Fourier convergence plot
│   ├── frobenius.js        # Frobenius conjugate phasors & secp256k1 Hasse trace chart
│   ├── views.js            # Namespace aggregator & verification contract surface
│   └── app.js              # Declarative state, VST A/B/C slot bank, URL hash sharing & 60fps loop
└── vendor/
    ├── three.min.js        # Vendored Three.js r128 (offline-safe)
    └── OrbitControls.js    # Vendored OrbitControls
```
