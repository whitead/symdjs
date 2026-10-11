// Plate notes for the 17 plane groups. "Paper" findings refer to the atlas
// of 258 Lennard-Jones crystals in Cox & White (2022), Fig. 2.

export interface GroupNote {
  /** one-line description of the symmetry elements */
  elements: string;
  /** a short paragraph for the plate */
  body: string;
  /** what the paper's Lennard-Jones atlas found, if notable */
  paper?: string;
}

export const groupNotes: Record<string, GroupNote> = {
  p1: {
    elements: "Translations only",
    body: "The asymmetric unit is the whole cell, so every particle is independent. This is ordinary periodic molecular dynamics, the baseline every other plate is measured against.",
    paper: "Without constraints the Lennard-Jones fluid finds its true ground state, hexagonal close packing.",
  },
  p2: {
    elements: "Four inequivalent half-turn centres",
    body: "Each particle has a partner rotated by 180° about one of four centres in the cell. Half-turns are compatible with any lattice, so the cell may shear freely.",
    paper: "Stable hexagonal packing.",
  },
  pm: {
    elements: "Parallel mirror lines",
    body: "Two families of parallel mirrors at x = 0 and x = ½. A particle near a mirror is pushed off it by its own reflection, unless it sits exactly on the mirror (Wyckoff positions a and b), where it slides along the line.",
    paper: "Many occupancies rearrange once the mirrors are released.",
  },
  pg: {
    elements: "Parallel glide reflections",
    body: "Reflection combined with a half-lattice translation. No point is left fixed, so pg has no special positions; every particle is general.",
    paper: "Stable hexagonal packing.",
  },
  cm: {
    elements: "Mirrors, with glides halfway between",
    body: "The centred rectangular cell holds two lattice points, so each mirror is interleaved with a glide line. Particles on a mirror (site a) have half the images of general particles.",
    paper: "Its square-like close packings do not survive without the symmetry.",
  },
  pmm: {
    elements: "Perpendicular mirrors; half-turns at their crossings",
    body: "Mirrors in two perpendicular directions cut the cell into four rectangles. The crossings are the four point sites a–d, and the mirror lines are line sites e–h.",
  },
  pmg: {
    elements: "Mirrors one way, glides the other; half-turns off the mirrors",
    body: "The half-turn centres sit between mirrors, on the glide lines. The cell must stay rectangular, but its aspect ratio is free under pressure.",
    paper: "Voids appear to be how these close-packed structures stabilise.",
  },
  pgg: {
    elements: "Perpendicular glides; half-turn centres",
    body: "Glide lines in two directions and no mirrors. The only special positions are half-turn centres.",
  },
  cmm: {
    elements: "Perpendicular mirrors and glides; two kinds of half-turn",
    body: "A centred rectangular group that can mimic a hexagonal lattice when the cell's aspect ratio reaches √3.",
    paper: "Hexagonal arrangements are stable; square-like close packings collapse.",
  },
  p4: {
    elements: "Quarter-turn centres and half-turn centres",
    body: "Rotations by 90° force a square lattice. Every general particle carries three rotated partners.",
  },
  p4m: {
    elements: "Mirrors along the edges and diagonals; 4-fold centres on mirrors",
    body: "Eight copies of every particle, kaleidoscoped by mirrors meeting at 45°. Particles on the diagonal mirrors (site f) or edge mirrors (d, e) slide along them.",
    paper: "Unusual metastable structures that are not hexagonal.",
  },
  p4g: {
    elements: "4-fold centres off the mirrors; diagonal mirrors; glides",
    body: "The quarter-turn centres lie between mirrors, which form a square lattice of their own rotated by 45°.",
    paper: "Square close packing, with no metastable structure.",
  },
  p3: {
    elements: "Three inequivalent 3-fold centres",
    body: "Rotations by 120° about three kinds of centre. The lattice must be hexagonal (γ = 120°).",
  },
  p3m1: {
    elements: "Mirrors through every 3-fold centre",
    body: "All three kinds of 3-fold centre lie on mirrors, which form a net of equilateral triangles.",
    paper: "Unusual metastable structures that are not hexagonal.",
  },
  p31m: {
    elements: "Mirrors through some 3-fold centres",
    body: "The centre at the origin lies on mirrors. The other two 3-fold centres do not, and they swap under the mirrors (site b).",
  },
  p6: {
    elements: "6-fold, 3-fold and 2-fold centres",
    body: "Rotations by 60° about the lattice points, with 3-fold and 2-fold centres between them.",
    paper: "Stable hexagonal packing.",
  },
  p6m: {
    elements: "Full hexagonal symmetry with mirrors",
    body: "The largest plane group: twelve copies of every particle. The asymmetric unit is a 30-60-90 triangle, 1/12 of the cell.",
    paper: "No metastable structure survives without the symmetry.",
  },
};
