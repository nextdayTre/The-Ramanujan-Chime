# BitWave fixtures (read-only import inputs)

These files exist only so `spike/bitwave-viewer.html` and its tests have real, offline
`.bitwave` documents to open. **Nothing in the instrument imports them.** They are the
BitWave tool's data, copied verbatim; the viewer never writes them back.

| file | source | schema | width | notes |
|---|---|---|---|---|
| `demo.bitwave.json` | `BitWave/examples/demo.bitwave.json` | 2 | 64 | routed lanes + a small CSV dataset (`dataset` is not rendered) |
| `glv-3phase-orbit.bitwave.json` | `BitWave/examples/glv-3phase-orbit.bitwave.json` | 3 | 256 | secp256k1-derived three-phase orbit, dense width |
| `rallentando-drift-n32.bitwave.json` | `BitWave/examples/rallentando-drift-n32.bitwave.json` | 3 | 32 | 9-row CSV dataset; `colA`/`colB` name data sources |
| `canonical-vectors.bitwave.json` | authored here from BitWave's canonical vectors (BitWave `AGENTS.md` §"The mental model" and `tests/design-invariants.test.ts`) | 3 | 64 | lane 1 = `A 8ADEFEDA85210125`, `B FFFFFFFF00000000`, `Z1 = A ⊕ B = 7521012585210125` (popcount 20) |

Provenance: copied 2026-11-10 from the local BitWave checkout
`C:\Users\trevor\Documents\BitWave` (toolset `1.1.0`, `.bitwave` schema 3). The three real
examples are unmodified bytes; only the canonical fixture was written here, with its
derivation stated above.
