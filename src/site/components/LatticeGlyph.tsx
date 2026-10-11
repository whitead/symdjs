// A small engraving of a Bravais lattice: 3×3 lattice points with one cell
// outlined, in the lattice family's colour.

import type { Lattice2D } from "../../engine/groups/bravais";
import { LATTICE_COLOR } from "../lib/palette";

const BASES: Record<Lattice2D, [number, number, number, number]> = {
  Oblique: [1, 0, 0.32, 0.86],
  Rectangular: [1.12, 0, 0, 0.74],
  Square: [0.9, 0, 0, 0.9],
  Hexagonal: [0.98, 0, 0.49, 0.85],
};

export function LatticeGlyph({ lattice, size = 40 }: { lattice: Lattice2D; size?: number }) {
  const [ax, ay, bx, by] = BASES[lattice];
  const s = 13;
  const pts: [number, number][] = [];
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++) pts.push([20 + s * (i * ax + j * bx), 20 - s * (i * ay + j * by)]);
  const c = (i: number, j: number) => `${20 + s * (i * ax + j * bx)},${20 - s * (i * ay + j * by)}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="lattice-glyph">
      <polygon
        points={`${c(0, 0)} ${c(1, 0)} ${c(1, 1)} ${c(0, 1)}`}
        fill={LATTICE_COLOR[lattice]}
        fillOpacity={0.22}
        stroke="var(--ink)"
        strokeWidth={0.9}
      />
      {pts.map(([x, y], k) => (
        <circle key={k} cx={x} cy={y} r={2.3} fill={LATTICE_COLOR[lattice]} stroke="var(--ink)" strokeWidth={0.7} />
      ))}
    </svg>
  );
}
