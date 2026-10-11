# symdjs: An Atlas of Symmetric Molecular Dynamics

A GPU-accelerated (WebGPU) JavaScript implementation of symmetric molecular
dynamics (Cox & White, *J. Chem. Theory Comput.* 2022, 18, 4077), presented as
a scrollable atlas of live, interactive simulations under every 2D plane
group and its Wyckoff sites. The C/Python reference implementation lives at
`../symd` (github.com/whitead/symd).

2D only for now. Everything is parameterized by the dimension `D` so 3D space
groups can be added later.

## Decisions

| Topic | Decision |
| --- | --- |
| UI | React + TypeScript, Vite, static build |
| GPU | WebGPU compute (WGSL). No fallback: browsers without WebGPU get a notice |
| Reference | CPU engine in TypeScript (Float64). Used for tests, tuning and as the oracle for GPU parity |
| T/P convention | True per-unit-cell temperature and pressure (see Physics) |
| Scope | All 17 plane groups with all Wyckoff sites. On load, 8 random (group, Wyckoff occupancy) configurations grow crystals live |

## Physics

Notation: `G` is the plane group as affine ops in fractional coordinates
(op 0 is the identity), `B` is the lattice matrix (columns are lattice
vectors), `s` holds fractional coordinates, and `q = B s`.

### Particles and orbits
* The independent particles are the asymmetric unit ("reps"). A rep in a
  general position has orbit size `|G|`. A rep on Wyckoff site `w` has orbit
  size `mult(w)`, which is the number of distinct images `g·s mod 1`.
* For Wyckoff sites, the image ops are coset representatives of `G / Stab`.
  They are derived by applying every genpos op to a generic point of the
  site and deduplicating mod 1. This does not depend on how the site strings
  are ordered.
* A Wyckoff site is the affine manifold `s = t + L u` (`L` is D×k, with `k`
  free parameters). Wyckoff reps store `u` and are always exactly on the
  site. Their velocities are projected onto the Cartesian tangent space
  `Π = M (MᵀM)⁻¹ Mᵀ` with `M = B L`. For linear constraints this is exactly
  RATTLE.

### Energy, forces, masses (per-unit-cell convention)
* `E_i = ½ Σ_{images e} Σ_{lattice n} u(|q_e + B n − q_i|)`, which excludes
  the self term (identity image, n = 0).
* `U_cell = Σ_i |orbit_i| E_i`. Report `U_cell / N_cell`.
* Rep `i` has mass `m_i = |orbit_i| m`. The force on the rep is
  `|orbit_i| F_i`, where `F_i` is the force from all neighbours on the rep
  particle. Acceleration is `F_i / m`.
* The Langevin noise uses `m_i`. KE is `Σ ½ m_i v_i²` and DOF is `Σ k_i`.
  `T` and `P` are the true temperature and pressure of the crystal.
* Result: a symmetric crystal at temperature `T` fluctuates like an
  unconstrained crystal at about `T/|G|`. Protocols are written in terms of
  `T* = T·n/N_cell`.

### Ghosts without tiling
* No ghost buffer and no fixed image count. For each rep `i` and each image
  `e = (j, g)`, take `ds = wrap(g·s_j) − s_i`, apply minimum image in
  fractional space, then loop over lattice translations `n` with
  `|n_k| ≤ ⌊r_c |b*_k| + ½⌋`, where `b*_k` is row `k` of `B⁻¹`.
* This is correct for any cell size, including cells smaller than the
  cutoff under NPT.

### Integrator
BAOAB Langevin on Cartesian velocities with fractional positions:
`s += ½dt B⁻¹ v`. Wyckoff reps use `u += ½dt (MᵀM)⁻¹ Mᵀ v`. With γ = 0 this
is velocity Verlet (NVE).

### NPT (Monte Carlo box moves, fixed fractional coordinates)
* The lattice is a parameter vector `p ∈ R^r` with `vec(B) = M_lat p`, where
  `M_lat = L_bravais Qᵀ` and `Q` is an orthonormal basis of the row space of
  the paper's Bravais tensor. Oblique (and later triclinic) lattices use an
  upper-triangular tensor so the frame cannot rotate.
* Moves perturb a single `p_k` symmetrically. Accept with
  `exp(−[ΔU_cell + P ΔV − T Σ_i ln(J_i'/J_i)] / T)`, where `J = V` for
  general reps, `√det(Lᵀ BᵀB L)` for Wyckoff reps with k ≥ 1, and 1 for
  points. The energy is evaluated at the proposed box.
* Guards: maximum aspect ratio, maximum image range, and Gauss reduction for
  oblique cells.
* Bugs in `../symd` that must not be ported: the trial energy is computed
  with the old box (box.c:314-317); a rejected move rescales positions
  (box.c:337-341); the LJ force is shifted but the energy is not
  (lj_force.c:118,193).

### Potentials
LJ truncated and shifted (forces consistent with the energy), WCA, a soft
cosine (for overlap removal), and a force cap for warmup.

## Architecture

```
data/symd/               copied group data from ../symd (MIT), 2D + 3D
src/engine/
  math/                  D-generic small dense linear algebra, affine ops, RNG
  groups/                xyz-notation parser, inequalities → half-spaces,
                         Group/Wyckoff construction, Bravais tensors,
                         symmetry elements (diagrams), names/orbifold symbols
  core/                  SystemSpec → SystemSetup (image table, box params,
                         initial state); potentials; protocols
  cpu/                   reference engine
  gpu/                   WebGPU engine: one workgroup per system, K steps per
                         dispatch, NPT on GPU, WGSL generated with const D
  render/                WebGPU instanced-disc renderer + overlays
src/site/                React app
tests/                   vitest (data, physics) + playwright (GPU parity, smoke)
```

### GPU design
* One `GPUDevice` shared by every plate's canvas.
* Fused kernel: one workgroup per system. Rep positions live in workgroup
  memory. The kernel loops over K steps (BAOAB, constraints, forces, and NPT
  every m steps) with barriers in between. One dispatch per frame advances
  all visible systems.
* Threads are mapped as (rep, lane) with a workgroup reduction, so tiny
  asymmetric units still use the whole workgroup.
* Counter-based RNG (a PCG hash of seed, step, particle and component) that
  is identical in JS and WGSL, for parity tests.
* The renderer reads the particle, op and box buffers directly (no
  readback). The instance index decodes to (tile, image).

### 3D groundwork
* Affine ops are (D+1)², Bravais tensors are D²×D², and both the 2D and 3D
  tables are ported.
* The parser accepts z. Half-space asymmetric units work in any D.
* Shaders are templated on `D`. The renderer sits behind an interface
  (`Disc2D` now, `Sphere3D` later).

## Site (scroll order)
1. **Hero**: full-bleed live crystal. Dragging a particle moves all of its
   symmetric images.
2. **Cabinet**: 8 random (group, Wyckoff occupancy, N) configurations
   growing crystals live, with a re-roll button.
3. **How it works**: a pinned, scroll-driven simulation. Asymmetric unit,
   then ops stamp out ghosts, then lattice tiling, then NPT with the Bravais
   lattice, then Wyckoff sites, then releasing the symmetry as a stability
   test.
4. **Atlas**: 17 plates grouped by lattice. Each has the HM and orbifold
   name, a generated symmetry diagram (mirrors, glides, rotation centres,
   asymmetric unit, Wyckoff letters), a live simulation, controls (N,
   per-site Wyckoff occupancy, T, P, potential, Melt / Regrow / Release),
   and readouts.
5. **Lab**: any group, custom generators, potentials.

Visual language: the paper's figure palette and cream paper, with ink-line
diagrams in the style of an old natural-history atlas.

## Validation
* **Data**: closure mod lattice, Wyckoff orbit sizes equal multiplicities,
  asymmetric-unit area = 1/|G| and it tiles the cell, Bravais tensors
  produce the right lattices.
* **Physics (CPU)**: finite-difference forces (general and Wyckoff
  particles), NVE energy conservation in all groups, symmetry invariance,
  ideal-gas NPT `⟨V⟩` against the analytic result, p1 LJ crystallizes
  hexagonal.
* **GPU**: parity with the CPU engine over 1, 10 and 100 steps. Screenshot
  smoke tests of every plate.

## Milestones
1. ~~Scaffold, group data pipeline, data tests.~~ Done.
2. ~~CPU reference engine and physics tests.~~ Done.
3. ~~WebGPU engine and renderer, plus a dev page running all groups.~~ Done.
   The GPU matches the CPU to float32 precision, NPT included.
4. ~~Atlas site: hero, cabinet, explainer, plates, interaction.~~ Done.
5. Lab removed at the owner's request: the site is an art piece, not a
   tool. `src/engine/groups/custom.ts` (closing generators, detecting the
   setting) remains in the engine with its tests. Performance and polish are
   ongoing.
6. Later: 3D. The group tables load and pass tests. Still needed: a 3D
   kernel instantiation (`makeLayout(3)`), a sphere renderer, and 3D
   asymmetric-unit sampling.

## As built: conventions worth knowing
* Engine `T` is the true temperature of the crystal. The UI sliders and
  readouts use the per-orbit temperature `T* = T / φ` with
  `φ = N_cell / n`, so one slider range works for every group. Release
  converts the system to p1 at `T = T*`.
* `P` is the true pressure in both the engine and the UI.
* The engine has no instantaneous (virial) pressure. The pressure readout
  shows the barostat setting.
* The GPU slots and limits are in `src/engine/gpu/layout.ts`:
  - per system: 256 reps, 768 particles per cell, group order ≤ 12, at
    most 10 Wyckoff sites;
  - lattice images: at most 4 per dimension;
  - 64 systems in total.
* Systems step only while their canvas is visible. Protocols advance with
  the system, so each plate grows its crystal when you arrive.
* The site is gated: without WebGPU only the notice renders, with no
  previews or fallbacks.
* Lennard-Jones only (rc = 3σ), with no potential choice in the UI.
* Random starts use sequential insertion so that every image stays ≥ 0.9σ
  from every other image. Growth then starts with capped-force LJ, and no
  soft potential is needed.
* Firefox (naga → Metal) passes each workgroup variable as a separate
  threadgroup argument, and Metal allows at most 31. Keep the kernel's
  workgroup memory packed into a few structs (`Ctl`, `OpW`, `SiteW`).
  Firefox is slower per dispatch (about 10 ms per 200 steps, against about
  2 ms in Chrome), so the hub adapts steps per frame to the frame rate.
