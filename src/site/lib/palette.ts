// JS mirror of the colour tokens in styles/tokens.css, for canvas drawing.

import type { Lattice2D } from "../../engine/groups/bravais";

/** The figure palette of Cox & White (2022), in the paper's order. */
export const PALETTE = [
  "#f94144",
  "#f3722c",
  "#f8961e",
  "#f9844a",
  "#f9c74f",
  "#90be6d",
  "#43aa8b",
  "#4d908e",
  "#577590",
  "#277da1",
] as const;

export const PAPER = "#f5f4e9";
export const PAPER_SUNK = "#edebdc";
export const INK = "#1f2430";

export const LATTICE_COLOR: Record<Lattice2D, string> = {
  Oblique: "#f8961e",
  Rectangular: "#43aa8b",
  Square: "#277da1",
  Hexagonal: "#f94144",
};

/** Mix two #rrggbb colours in sRGB; t = 0 gives a, t = 1 gives b. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const m = (s: number) => Math.round(ch(pa, s) * (1 - t) + ch(pb, s) * t);
  return `rgb(${m(16)} ${m(8)} ${m(0)})`;
}
