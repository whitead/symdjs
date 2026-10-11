// Site-level metadata for the 17 plane groups: plate order, captions,
// short descriptions, Wyckoff occupancy helpers and display formatting.

import type { Lattice2D } from "../../engine/groups/bravais";
import type { Group, WyckoffSite } from "../../engine/groups/group";
import { planeGroup, planeGroups } from "../../engine/groups/library";
import { Rng } from "../../engine/math/rng";

/** Number of particles placed on each Wyckoff site letter. */
export type Occupancy = Record<string, number>;

export interface LatticeFamily {
  name: Lattice2D;
  groups: string[];
  description: string;
}

export const LATTICE_FAMILIES: LatticeFamily[] = [
  {
    name: "Oblique",
    groups: ["p1", "p2"],
    description: "Two unequal lattice vectors at any angle. The box may stretch and shear freely.",
  },
  {
    name: "Rectangular",
    groups: ["pm", "pg", "cm", "pmm", "pmg", "pgg", "cmm"],
    description:
      "Perpendicular lattice vectors whose lengths change independently. The c groups use a centred cell.",
  },
  {
    name: "Square",
    groups: ["p4", "p4m", "p4g"],
    description: "Perpendicular lattice vectors of equal length. The box can only grow or shrink.",
  },
  {
    name: "Hexagonal",
    groups: ["p3", "p3m1", "p31m", "p6", "p6m"],
    description: "Equal lattice vectors at 120°. Like the square lattice, the box keeps its shape and changes only its size.",
  },
];

export interface GroupNote {
  blurb: string;
  /** a finding from the paper's atlas of 258 Lennard-Jones crystals */
  field?: string;
}

const HEX = "In the paper's atlas of Lennard-Jones crystals, this group gives hexagonal packing.";
const META = "In the paper's atlas of Lennard-Jones crystals, this group gives unusual metastable structures.";

export const GROUP_NOTES: Record<string, GroupNote> = {
  p1: {
    blurb: "Translations only. Nothing relates one particle to another inside the cell, so the asymmetric unit is the whole cell.",
    field: HEX,
  },
  p2: { blurb: "Half-turns: four kinds of twofold rotation centre in every cell, and no reflections.", field: HEX },
  pm: { blurb: "Parallel mirror lines, two in every cell. A particle placed on a mirror stays on it." },
  pg: {
    blurb: "Parallel glide reflections: reflect, then slide half a cell. No mirrors, and so no special positions.",
    field: HEX,
  },
  cm: { blurb: "Mirrors alternating with parallel glide lines, on a centred rectangular cell." },
  pmm: { blurb: "Mirrors in two perpendicular directions, crossing at twofold rotation centres." },
  pmg: { blurb: "Mirrors in one direction and glides in the other, with half-turn centres lying off the mirrors." },
  pgg: { blurb: "Glide reflections in two perpendicular directions and half-turn centres, but no mirrors." },
  cmm: {
    blurb: "Perpendicular mirrors on a centred cell, with extra half-turn centres between the mirror crossings.",
    field: HEX,
  },
  p4: { blurb: "Quarter-turn centres with half-turn centres between them, and no reflections." },
  p4m: { blurb: "Quarter-turn centres on mirrors in four directions: the symmetry of a square grid.", field: META },
  p4g: { blurb: "Quarter-turn centres that lie off the mirrors. The mirrors cross at half-turn centres between them." },
  p3: { blurb: "Three kinds of threefold rotation centre, and no reflections.", field: HEX },
  p3m1: { blurb: "Mirrors in three directions, passing through every threefold centre.", field: META },
  p31m: { blurb: "Mirrors in three directions through some threefold centres; the others sit between the mirrors." },
  p6: { blurb: "Sixfold, threefold and twofold rotation centres, and no reflections.", field: HEX },
  p6m: {
    blurb: "Sixfold centres on mirrors in six directions: the full symmetry of the hexagonal lattice and the largest plane group.",
    field: "In the paper's atlas of Lennard-Jones crystals, p6m has no metastable structure.",
  },
};

const ROMAN: [number, string][] = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
  [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

export function toRoman(n: number): string {
  let out = "";
  for (const [v, s] of ROMAN) while (n >= v) {
    out += s;
    n -= v;
  }
  return out;
}

export function latticeLabel(l: Lattice2D | string): string {
  return `${l.toLowerCase()} lattice`;
}

export { planeGroup, planeGroups };

// ---- Wyckoff occupancy -------------------------------------------------

/** Points (k = 0) hold at most one particle; lines and the general position more. */
export function maxCount(site: WyckoffSite, order: number): number {
  if (site.k === 0) return 1;
  if (!site.general) return 4;
  return Math.max(4, Math.ceil(40 / order));
}

export function cellCount(g: Group, occ: Occupancy): number {
  return g.sites.reduce((n, s) => n + (occ[s.letter] ?? 0) * s.multiplicity, 0);
}

export function repCount(occ: Occupancy): number {
  return Object.values(occ).reduce((n, c) => n + c, 0);
}

/** "2×8g + 4e + 1a": general position first, then by multiplicity. */
export function occupancyLabel(g: Group, occ: Occupancy): string {
  return g.sites
    .filter((s) => (occ[s.letter] ?? 0) > 0)
    .sort((a, b) => b.multiplicity - a.multiplicity || a.letter.localeCompare(b.letter))
    .map((s) => {
      const c = occ[s.letter];
      return c > 1 ? `${c}×${s.label}` : s.label;
    })
    .join(" + ");
}

export function occupancyKey(occ: Occupancy): string {
  return Object.keys(occ)
    .sort()
    .filter((k) => occ[k] > 0)
    .map((k) => `${k}${occ[k]}`)
    .join("");
}

export function defaultOccupancy(g: Group): Occupancy {
  const occ: Occupancy = {};
  const general = g.sites[g.sites.length - 1];
  occ[general.letter] = Math.max(1, Math.round(16 / g.order));
  const point = g.sites.find((s) => s.k === 0);
  const line = g.sites.find((s) => s.k === 1);
  if (point) occ[point.letter] = 1;
  if (line) occ[line.letter] = 1;
  return occ;
}

export function randomOccupancy(g: Group, rng: Rng): Occupancy {
  const occ: Occupancy = {};
  const specials = g.sites.filter((s) => !s.general);
  const general = g.sites[g.sites.length - 1];
  const target = 12 + rng.next() * 22;
  let nSpecial = Math.min(specials.length, rng.int(3));
  const pool = [...specials];
  let specialN = 0;
  while (nSpecial-- > 0 && pool.length) {
    const s = pool.splice(rng.int(pool.length), 1)[0];
    const c = s.k === 0 ? 1 : 1 + rng.int(2);
    occ[s.letter] = c;
    specialN += c * s.multiplicity;
  }
  occ[general.letter] = Math.max(1, Math.round((target - specialN) / g.order));
  return occ;
}

export interface Specimen {
  group: Group;
  occupancy: Occupancy;
  seed: number;
}

/** Eight random (group, occupancy) configurations, with no repeated group. */
export function randomCabinet(seed: number, count = 8): Specimen[] {
  const rng = new Rng(seed * 7919 + 17);
  const pool = [...planeGroups()];
  const out: Specimen[] = [];
  for (let i = 0; i < count && pool.length; i++) {
    const group = pool.splice(rng.int(pool.length), 1)[0];
    out.push({ group, occupancy: randomOccupancy(group, rng), seed: (seed * 131 + i * 977 + 1) >>> 0 });
  }
  return out;
}

// ---- Geometry ------------------------------------------------------------

/**
 * A representative lattice for drawing, |a| = 1. Row-major 2×2 with the
 * lattice vectors as columns (B[0], B[2]) = a and (B[1], B[3]) = b.
 */
export function latticeBasis(g: Group): Float64Array {
  const centred = g.name.startsWith("c");
  switch (g.lattice) {
    case "Square":
      return Float64Array.of(1, 0, 0, 1);
    case "Hexagonal":
      return Float64Array.of(1, -0.5, 0, Math.sqrt(3) / 2);
    case "Rectangular":
      return centred ? Float64Array.of(1, 0, 0, 1.58) : Float64Array.of(1, 0, 0, 1.3);
    default:
      return Float64Array.of(1, 0.28, 0, 1.12);
  }
}

export function siteKind(site: WyckoffSite): "point" | "line" | "general" {
  return site.general ? "general" : site.k === 0 ? "point" : "line";
}
