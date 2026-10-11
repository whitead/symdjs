# An atlas of 2D crystals

With symmetric molecular dynamics: live Lennard-Jones simulations under every two-dimensional plane group
and Wyckoff site, running on the GPU in your browser.

This is a WebGPU implementation of *symmetric molecular dynamics*
([Cox & White, J. Chem. Theory Comput. 2022, 18, 4077](https://doi.org/10.1021/acs.jctc.2c00401);
reference implementation [whitead/symd](https://github.com/whitead/symd)).
Only the asymmetric unit is integrated. Every other particle is a ghost made
by the group's affine operations, so each configuration is exactly
symmetric at every step.

## Running

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # CPU engine + group data tests (vitest)
npm run test:gpu   # WebGPU vs CPU parity in headless Chrome (playwright)
npm run build      # static site in dist/
```

You need a browser with WebGPU: recent Chrome or Edge, Safari 26+, or
Firefox on Windows or macOS. Without WebGPU, the site shows only a notice.

Dev pages:
* `/render.html`: 8 random crystals.
* `/diagrams.html`: symmetry diagrams for all 17 groups.
* `/parity.html`: GPU/CPU comparison.
* `/ffdiag.html`: per-shader WebGPU diagnostics.

Firefox can't be driven by Playwright, so run
`scripts/firefox-check.sh "http://localhost:5173/?selftest"` instead. It
opens a throwaway Firefox profile and prints which canvases drew
particles.

## How it works

| Piece | Where |
| --- | --- |
| xyz-notation parser, groups, Wyckoff sites, asymmetric units, Bravais lattices | `src/engine/groups` |
| CPU reference engine (Float64) | `src/engine/cpu/engine.ts` |
| WebGPU engine: one workgroup per system, K steps per dispatch | `src/engine/gpu` |
| Instanced-disc renderer reading the simulation buffers directly | `src/engine/render` |
| Protocols (crystal growth, Lennard-Jones only), interaction, symmetry release | `src/engine/core`, `src/sim` |
| The site | `src/site` |

The physics, including where it deliberately differs from the C reference
code, is documented in [PLAN.md](PLAN.md). In short:

* Positions are fractional. Ghost images are generated on the fly, and the
  exact set of lattice translations within the cutoff is looped over, so
  cells may be smaller than the cutoff.
* Wyckoff particles live on their site manifolds, with RATTLE velocity
  projection.
* Masses are orbit sizes, so `T` and `P` are the true temperature and
  pressure of the crystal. A symmetric crystal at `T` moves like an
  unconstrained one at `T/|G|`.
* NPT uses Monte Carlo moves in lattice-parameter space, with the energy
  evaluated at the proposed box, a Jacobian term and a Hastings correction.
  Tests check the ideal-gas volume distribution analytically.
* CPU and GPU share a counter-based RNG, and their trajectories agree to
  float32 precision.

Everything is parameterized by the dimension `D`. The 230 space groups
already load and pass closure tests. Adding 3D needs a 3D kernel
instantiation and a sphere renderer.

## Credits

Group tables come from the symd package (MIT), derived from the Bilbao
Crystallographic Server. The palette and paper texture follow Figure 2 of
the paper.
