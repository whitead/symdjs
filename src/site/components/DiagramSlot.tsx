// The framed slot for a plate's symmetry diagram.
//
// SymmetryDiagram (mirrors, glides, rotation centres, asymmetric unit,
// Wyckoff letters) is being built separately. Until it lands, the slot shows
// UnitCellSketch: a PLACEHOLDER drawing of the conventional cell, its
// asymmetric unit and the special Wyckoff positions, computed from the group.
// To plug the real one in, render <SymmetryDiagram group={group} /> where
// <UnitCellSketch> is below; the frame keeps the size (square, fills width).

import { useId } from "react";
import type { Group } from "../../engine/groups/group";
import { applyAffine, linearPart } from "../../engine/math/affine";
import { latticeBasis } from "../lib/groups";
import "../styles/components/diagram-slot.css";

export interface DiagramSlotProps {
  group: Group;
  caption?: string;
  className?: string;
}

export function DiagramSlot({ group, caption = "Unit cell & Wyckoff sites", className }: DiagramSlotProps) {
  return (
    <figure className={["diagram-slot", className].filter(Boolean).join(" ")}>
      <div className="diagram-slot__frame">
        {/* SymmetryDiagram plugs in here */}
        <UnitCellSketch group={group} />
      </div>
      <figcaption className="diagram-slot__caption">{caption}</figcaption>
    </figure>
  );
}

// ---- PLACEHOLDER sketch -------------------------------------------------

const VIEW = 200;
const PAD = 26;

function clipToUnit(px: number, py: number, dx: number, dy: number): [number, number] | null {
  let lo = -Infinity;
  let hi = Infinity;
  for (const [p, d] of [
    [px, dx],
    [py, dy],
  ]) {
    if (Math.abs(d) < 1e-12) {
      if (p < -1e-9 || p > 1 + 1e-9) return null;
    } else {
      const a = (0 - p) / d;
      const b = (1 - p) / d;
      lo = Math.max(lo, Math.min(a, b));
      hi = Math.min(hi, Math.max(a, b));
    }
  }
  return hi - lo > 1e-6 ? [lo, hi] : null;
}

export function UnitCellSketch({ group }: { group: Group }) {
  const hatchId = useId();
  const B = latticeBasis(group);
  // fit the cell into the view (y up)
  const cx = [0, B[0], B[1], B[0] + B[1]];
  const cy = [0, B[2], B[3], B[2] + B[3]];
  const minX = Math.min(...cx);
  const maxX = Math.max(...cx);
  const minY = Math.min(...cy);
  const maxY = Math.max(...cy);
  const k = (VIEW - 2 * PAD) / Math.max(maxX - minX, maxY - minY);
  const offX = (VIEW - k * (maxX - minX)) / 2 - k * minX;
  const offY = (VIEW + k * (maxY - minY)) / 2 + k * minY;
  const P = (fx: number, fy: number): [number, number] => [
    offX + k * (B[0] * fx + B[1] * fy),
    offY - k * (B[2] * fx + B[3] * fy),
  ];
  const path = (pts: number[][]) =>
    pts.map(([fx, fy], i) => `${i ? "L" : "M"}${P(fx, fy).map((v) => v.toFixed(1)).join(",")}`).join("") + "Z";

  const cell = path([
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]);
  const asym = group.asymPolygon ? path(group.asymPolygon) : null;

  // mirror-line sites: every image segment inside the cell
  const lines: { key: string; d: string }[] = [];
  const seen = new Set<string>();
  for (const site of group.sites) {
    if (site.general || site.k !== 1) continue;
    for (const o of site.cosetOps) {
      const op = group.ops[o];
      const p0 = applyAffine(op, site.t);
      const R = linearPart(op);
      const dx = R[0] * site.L[0] + R[1] * site.L[1];
      const dy = R[2] * site.L[0] + R[3] * site.L[1];
      for (let i = -2; i <= 2; i++)
        for (let j = -2; j <= 2; j++) {
          const px = p0[0] + i;
          const py = p0[1] + j;
          const span = clipToUnit(px, py, dx, dy);
          if (!span) continue;
          const a = [px + dx * span[0], py + dy * span[0]];
          const b = [px + dx * span[1], py + dy * span[1]];
          const key = [a, b]
            .map((p) => p.map((v) => v.toFixed(3)).join(","))
            .sort()
            .join("|");
          if (seen.has(key)) continue;
          seen.add(key);
          const [ax, ay] = P(a[0], a[1]);
          const [bx, by] = P(b[0], b[1]);
          lines.push({ key: `${site.letter}${key}`, d: `M${ax.toFixed(1)},${ay.toFixed(1)}L${bx.toFixed(1)},${by.toFixed(1)}` });
        }
    }
  }

  // label each mirror-line site at the middle of its representative segment
  const lineLabels: { key: string; x: number; y: number; letter: string }[] = [];
  for (const site of group.sites) {
    if (site.general || site.k !== 1) continue;
    const [lo, hi] = site.uRange[0] ?? [0, 0.5];
    const u = (lo + hi) / 2;
    let fx = site.t[0] + site.L[0] * u;
    let fy = site.t[1] + site.L[1] * u;
    fx -= Math.floor(fx + 1e-9);
    fy -= Math.floor(fy + 1e-9);
    const [x, y] = P(fx, fy);
    lineLabels.push({ key: site.letter, x, y, letter: site.letter });
  }

  // point sites: all images in the closed cell; label the representative
  const points: { key: string; x: number; y: number; letter: string; label: boolean }[] = [];
  for (const site of group.sites) {
    if (site.k !== 0) continue;
    const pseen = new Set<string>();
    let labelled = false;
    const tx = site.t[0] - Math.floor(site.t[0] + 1e-9);
    const ty = site.t[1] - Math.floor(site.t[1] + 1e-9);
    for (const o of site.cosetOps) {
      const p = applyAffine(group.ops[o], site.t);
      const fx = p[0] - Math.floor(p[0] + 1e-9);
      const fy = p[1] - Math.floor(p[1] + 1e-9);
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++) {
          const x = fx + i;
          const y = fy + j;
          if (x < -1e-6 || x > 1 + 1e-6 || y < -1e-6 || y > 1 + 1e-6) continue;
          const key = `${x.toFixed(3)},${y.toFixed(3)}`;
          if (pseen.has(key)) continue;
          pseen.add(key);
          const [sx, sy] = P(x, y);
          const isRep = !labelled && Math.abs(x - tx) < 1e-6 && Math.abs(y - ty) < 1e-6;
          if (isRep) labelled = true;
          points.push({ key: `${site.letter}${key}`, x: sx, y: sy, letter: site.letter, label: isRep });
        }
    }
  }

  const [ox, oy] = P(0, 0);
  const [ax, ay] = P(1, 0);
  const [bx, by] = P(0, 1);

  return (
    <svg className="unit-cell" viewBox={`0 0 ${VIEW} ${VIEW}`} role="img" aria-label={`Unit cell of ${group.name}`}>
      <defs>
        <pattern id={hatchId} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" className="unit-cell__hatch" />
        </pattern>
      </defs>
      {asym && (
        <>
          <path d={asym} className="unit-cell__asym-fill" />
          <path d={asym} fill={`url(#${hatchId})`} />
          <path d={asym} className="unit-cell__asym" />
        </>
      )}
      <path d={cell} className="unit-cell__cell" />
      {lines.map((l) => (
        <path key={l.key} d={l.d} className="unit-cell__mirror" />
      ))}
      {lineLabels.map((l) => (
        <text key={l.key} x={l.x + 5} y={l.y - 4} className="unit-cell__letter unit-cell__letter--line">
          {l.letter}
        </text>
      ))}
      {points.map((p) => (
        <g key={p.key}>
          <circle cx={p.x} cy={p.y} r={3.6} className="unit-cell__point" />
          {p.label && (
            <text x={p.x + 6} y={p.y - 5} className="unit-cell__letter">
              {p.letter}
            </text>
          )}
        </g>
      ))}
      <text x={(ox + ax) / 2} y={Math.max(oy, ay) + 15} className="unit-cell__axis" textAnchor="middle">
        a
      </text>
      <text x={(ox + bx) / 2 - 11} y={(oy + by) / 2 + 4} className="unit-cell__axis" textAnchor="middle">
        b
      </text>
    </svg>
  );
}
