// International-Tables-style symmetry diagram of a plane group: the unit
// cell, mirrors (solid), glide lines (dashed), rotation centres (lens,
// triangle, square, hexagon), the asymmetric unit and the Wyckoff sites.
// Colours come from CSS custom properties so the page theme can override
// them: --ink, --paper, --accent, --asym.

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { boxFromParams } from "../../engine/groups/bravais";
import { symmetryElements, type RotationCentre, type SymmetryElements2D, type Vec2 } from "../../engine/groups/elements2d";
import type { Group, WyckoffSite } from "../../engine/groups/group";
import { applyAffine, linearPart } from "../../engine/math/affine";
import { inverse, matMul, matVec, transpose } from "../../engine/math/linalg";

const INK = "var(--ink, #1f2430)";
const PAPER = "var(--paper, #f5f4e9)";
const ACCENT = "var(--accent, #f94144)";
const ASYM = "var(--asym, #f9c74f)";
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';

export interface SymmetryDiagramProps {
  group: Group;
  /** lattice matrix (row-major 2×2, columns are a and b); defaults to defaultLattice(group) */
  B?: Float64Array;
  /** width and height in px */
  size?: number;
  /** draw an n × n block of cells */
  cells?: number;
  showAsym?: boolean;
  showWyckoff?: boolean;
  /** Wyckoff letter to emphasize */
  highlightSite?: string;
  onHoverSite?: (letter: string | null) => void;
  className?: string;
}

// a along x, b up (row-major, columns are lattice vectors)
const SHAPES: Record<string, number[]> = {
  Oblique: [1, -0.22, 0, 0.82], // |b| ≈ 0.85 a, γ ≈ 105°
  Rectangular: [1, 0, 0, 0.78],
  Square: [1, 0, 0, 1],
  Hexagonal: [1, -0.5, 0, Math.sqrt(3) / 2],
};

/** A pleasant lattice of unit area, least-squares fitted inside the group's lattice parameterization. */
export function defaultLattice(group: Group): Float64Array {
  const { M, r } = group.latticeParams;
  const Mt = transpose(M, 4, r);
  const p = matVec(inverse(matMul(Mt, M, r, 4, r), r), matVec(Mt, SHAPES[group.lattice] ?? SHAPES.Square, r, 4), r, r);
  const B = boxFromParams(group.latticeParams, p);
  const s = 1 / Math.sqrt(Math.abs(B[0] * B[3] - B[1] * B[2]));
  return B.map((v) => v * s);
}

type Pt = [number, number];
const TOL = 1e-9;
const isInt = (v: number) => Math.abs(v - Math.round(v)) < 1e-7;
const fmt = (v: number) => +v.toFixed(2);
const pts = (ps: Pt[]) => ps.map((p) => `${fmt(p[0])},${fmt(p[1])}`).join(" ");
const norm = (v: Pt): Pt => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};

/** Clip the segment p→q to [0, n]² (fractional); null if it misses. */
function clipSegment(p: Vec2, q: Vec2, n: number): [Vec2, Vec2] | null {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 2; i++) {
    const d = q[i] - p[i];
    if (Math.abs(d) < TOL) {
      if (p[i] < -TOL || p[i] > n + TOL) return null;
    } else {
      const a = -p[i] / d;
      const b = (n - p[i]) / d;
      lo = Math.max(lo, Math.min(a, b));
      hi = Math.min(hi, Math.max(a, b));
    }
  }
  if (hi - lo < 1e-6) return null;
  const at = (s: number): Vec2 => [p[0] + s * (q[0] - p[0]), p[1] + s * (q[1] - p[1])];
  return [at(lo), at(hi)];
}

/** Images of a point (one vertex) or segment (two) under the group, clipped to [0, n]². */
function orbitInRegion(group: Group, verts: Vec2[], n: number): Vec2[][] {
  const out: Vec2[][] = [];
  const seen = new Set<string>();
  const key = (v: Vec2) => `${Math.round(v[0] * 1e5)},${Math.round(v[1] * 1e5)}`;
  for (const op of group.ops) {
    const ys = verts.map((v) => applyAffine(op, v));
    const f = [Math.floor(ys[0][0]), Math.floor(ys[0][1])];
    for (let a = -1; a <= n; a++)
      for (let b = -1; b <= n; b++) {
        const zs = ys.map((y): Vec2 => [y[0] + a - f[0], y[1] + b - f[1]]);
        let img: Vec2[] | null;
        if (zs.length === 1) img = zs[0].every((v) => v > -TOL && v < n + TOL) ? zs : null;
        else img = clipSegment(zs[0], zs[1], n);
        if (!img) continue;
        const k = img.map(key).sort().join("|");
        if (!seen.has(k)) {
          seen.add(k);
          out.push(img);
        }
      }
  }
  return out;
}

/**
 * Cartesian direction of each rotation symbol (lens axis, triangle or
 * hexagon vertex, square edge). Symbols are equivariant: a centre that is
 * the image of an earlier one under g gets the image direction. New orbits
 * align with a mirror through the point if there is one.
 */
function symbolDirections(group: Group, B: Float64Array, el: SymmetryElements2D): Pt[] {
  const Binv = inverse(B, 2);
  const cart = group.ops.map((op) => matMul(matMul(B, linearPart(op), 2, 2, 2), Binv, 2, 2, 2));
  const reps: { rc: RotationCentre; v: Pt }[] = [];
  return el.rotations.map((rc) => {
    for (const rep of reps) {
      if (rep.rc.order !== rc.order) continue;
      for (let i = 0; i < group.ops.length; i++) {
        const y = applyAffine(group.ops[i], rep.rc.pos);
        if (isInt(y[0] - rc.pos[0]) && isInt(y[1] - rc.pos[1])) {
          const R = cart[i];
          return [R[0] * rep.v[0] + R[1] * rep.v[1], R[2] * rep.v[0] + R[3] * rep.v[1]];
        }
      }
    }
    // lenses and squares follow a; triangles and hexagons point perpendicular to it
    const a = norm([B[0], B[2]]);
    const pref: Pt = rc.order === 2 || rc.order === 4 ? a : [-a[1], a[0]];
    let v = pref;
    if (rc.order !== 4) {
      let best = -1;
      for (const l of el.mirrors) {
        if (Math.abs(-l.dir[1] * rc.pos[0] + l.dir[0] * rc.pos[1] - l.offset) > 1e-7) continue;
        let m = norm([B[0] * l.dir[0] + B[1] * l.dir[1], B[2] * l.dir[0] + B[3] * l.dir[1]]);
        const c = m[0] * pref[0] + m[1] * pref[1];
        if (c < 0) m = [-m[0], -m[1]];
        if (Math.abs(c) > best + 1e-9) {
          best = Math.abs(c);
          v = m;
        }
      }
    }
    reps.push({ rc, v });
    return v;
  });
}

/** Screen-space outline of a rotation symbol of radius r at c with Cartesian direction v. */
function symbolPath(order: number, c: Pt, v: Pt, r: number): string {
  const th = Math.atan2(v[1], v[0]);
  const at = (rho: number, phi: number): Pt => [c[0] + rho * Math.cos(phi), c[1] - rho * Math.sin(phi)];
  if (order === 2) {
    const h = 1.3 * r;
    const k = 0.55 * r;
    const rho = fmt((h * h + k * k) / (2 * k));
    const [e1, e2] = [at(h, th), at(h, th + Math.PI)];
    return `M${pts([e2])}A${rho} ${rho} 0 0 1 ${pts([e1])}A${rho} ${rho} 0 0 1 ${pts([e2])}Z`;
  }
  const [rho, phase] = order === 3 ? [1.25 * r, 0] : order === 4 ? [1.2 * r, Math.PI / 4] : [1.1 * r, 0];
  return `M${pts(Array.from({ length: order }, (_, i) => at(rho, th + phase + (2 * Math.PI * i) / order)))}Z`;
}

interface SiteMark {
  site: WyckoffSite;
  /** representative: one point (k = 0) or a segment (k = 1) */
  rep: Vec2[];
  images: Vec2[][];
  /** label position (screen) */
  label: Pt;
}

export function SymmetryDiagram({
  group,
  B: Bprop,
  size = 320,
  cells = 1,
  showAsym = true,
  showWyckoff = true,
  highlightSite,
  onHoverSite,
  className,
}: SymmetryDiagramProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const active = highlightSite ?? hovered;

  const geo = useMemo(() => {
    const B = Bprop ?? defaultLattice(group);
    const n = cells;
    const cart = (s: ArrayLike<number>): Pt => [B[0] * s[0] + B[1] * s[1], B[2] * s[0] + B[3] * s[1]];
    const corners = [[0, 0], [n, 0], [0, n], [n, n]].map(cart);
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const pad = size * 0.09;
    const scale = Math.min((size - 2 * pad) / (x1 - x0), (size - 2 * pad) / (y1 - y0));
    const ox = (size - scale * (x1 - x0)) / 2 - scale * x0;
    const oy = (size + scale * (y1 - y0)) / 2 + scale * y0;
    const toScreen = (s: ArrayLike<number>): Pt => {
      const q = cart(s);
      return [ox + scale * q[0], oy - scale * q[1]];
    };
    const k = Math.max(0.7, size / 320); // stroke and type scale
    const cellPx = scale * Math.sqrt(Math.abs(B[0] * B[3] - B[1] * B[2]));
    const r = Math.max(2.2, Math.min(6.5 * k, cellPx * 0.042));

    const el = symmetryElements(group, n);
    const dirs = symbolDirections(group, B, el);

    // a generic point inside the asymmetric unit, for the general-position orbit
    const poly = group.asymPolygon ?? [[0, 0], [1, 0], [1, 1], [0, 1]];
    const cen: Vec2 = [
      poly.reduce((a, p) => a + p[0], 0) / poly.length,
      poly.reduce((a, p) => a + p[1], 0) / poly.length,
    ];
    const generic: Vec2 = [0.62 * cen[0] + 0.38 * poly[0][0] + 0.011, 0.62 * cen[1] + 0.38 * poly[0][1] + 0.007];
    const genericOrbit = orbitInRegion(group, [generic], n).map((im) => im[0]);

    // Wyckoff marks; labels point into the asymmetric unit. Points are
    // labelled first, then lines, sliding each line label along its segment
    // to keep clear of rotation symbols and earlier labels.
    const fontSize = Math.max(8, 12 * k);
    const ringR = 1.75 * r;
    const cenS = toScreen(cen);
    const taken: Pt[] = el.rotations.map((rc) => toScreen(rc.pos));
    const clearance = (p: Pt) => Math.min(...taken.map((o) => Math.hypot(o[0] - p[0], o[1] - p[1])));
    const marks: SiteMark[] = group.sites
      .filter((s) => !s.general && s.k <= 1)
      .sort((a, b) => a.k - b.k)
      .map((site) => {
        const at = (u: number): Vec2 => [site.t[0] + site.L[0] * u, site.t[1] + site.L[1] * u];
        const rep = site.k === 0 ? [[site.t[0], site.t[1]] as Vec2] : site.uRange[0].map(at);
        const [s0, s1] = [toScreen(rep[0]), toScreen(rep[rep.length - 1])];
        let label: Pt;
        if (site.k === 0) {
          const d = norm([cenS[0] - s0[0], cenS[1] - s0[1]]);
          const dist = ringR + 0.55 * fontSize;
          label = [s0[0] + d[0] * dist, s0[1] + d[1] * dist];
        } else {
          const t = norm([s1[0] - s0[0], s1[1] - s0[1]]);
          let d: Pt = [-t[1], t[0]];
          const mid: Pt = [(s0[0] + s1[0]) / 2, (s0[1] + s1[1]) / 2];
          if (d[0] * (cenS[0] - mid[0]) + d[1] * (cenS[1] - mid[1]) < 0) d = [-d[0], -d[1]];
          const dist = 3.5 * k + 0.6 * fontSize;
          const cands = [0.5, 0.4, 0.6, 0.3, 0.7, 0.22, 0.78].map((f): Pt => [
            s0[0] + f * (s1[0] - s0[0]) + d[0] * dist,
            s0[1] + f * (s1[1] - s0[1]) + d[1] * dist,
          ]);
          label = cands.find((c) => clearance(c) > 2.4 * fontSize) ?? cands.reduce((a, c) => (clearance(c) > clearance(a) ? c : a));
        }
        taken.push(label);
        return { site, rep, images: orbitInRegion(group, rep, n), label };
      })
      .sort((a, b) => a.site.letter.localeCompare(b.site.letter));
    return { B, n, toScreen, k, r, el, dirs, marks, poly, genericOrbit, fontSize, ringR };
  }, [group, Bprop, cells, size]);

  const { n, toScreen, k, r, el, dirs, marks, poly, genericOrbit, fontSize, ringR } = geo;
  const general = group.sites.find((s) => s.general)!;
  const hover = (letter: string | null) => {
    setHovered(letter);
    onHoverSite?.(letter);
  };

  const line = (p: Vec2, q: Vec2, key: string, style: CSSProperties) => {
    const [a, b] = [toScreen(p), toScreen(q)];
    return <line key={key} x1={fmt(a[0])} y1={fmt(a[1])} x2={fmt(b[0])} y2={fmt(b[1])} style={style} />;
  };

  // unit-cell grid, except where a mirror or glide line runs along it
  const covered = (dir: Vec2, offset: number) =>
    [...el.mirrors, ...el.glides].some((l) => l.dir[0] === dir[0] && l.dir[1] === dir[1] && Math.abs(l.offset - offset) < 1e-9);
  const grid: ReactNode[] = [];
  for (let i = 0; i <= n; i++) {
    if (!covered([0, 1], -i)) grid.push(line([i, 0], [i, n], `a${i}`, { stroke: INK, strokeWidth: 0.9 * k }));
    if (!covered([1, 0], i)) grid.push(line([0, i], [n, i], `b${i}`, { stroke: INK, strokeWidth: 0.9 * k }));
  }

  const siteLayers = showWyckoff
    ? marks.map(({ site, rep, images, label: lp }) => {
        const on = active === site.letter;
        const repS = rep.map(toScreen);
        const handlers = { onPointerEnter: () => hover(site.letter), onPointerLeave: () => hover(null) };
        const tip = `${site.label}  (${site.repr})  site-symmetry order ${site.siteSymmetryOrder}`;
        const strokeW = (on ? 6.5 : 5) * k;
        const marksEl =
          site.k === 0 ? (
            <g>
              {(on ? images : [rep]).map((im, i) => {
                const c = toScreen(im[0]);
                return (
                  <circle
                    key={i}
                    cx={fmt(c[0])}
                    cy={fmt(c[1])}
                    r={fmt(ringR)}
                    style={{ fill: "none", stroke: ACCENT, strokeWidth: (on ? 1.5 : 1.1) * k }}
                  />
                );
              })}
              <circle cx={fmt(repS[0][0])} cy={fmt(repS[0][1])} r={fmt(ringR + 3)} style={{ fill: "transparent" }} />
            </g>
          ) : (
            <g style={{ strokeLinecap: "round" }}>
              {on &&
                images.map((im, i) => line(im[0], im[1], `i${i}`, { stroke: ACCENT, strokeWidth: strokeW, opacity: 0.32 }))}
              {line(rep[0], rep[1], "rep", { stroke: ACCENT, strokeWidth: strokeW, opacity: on ? 0.62 : 0.38 })}
              {line(rep[0], rep[1], "hit", { stroke: "transparent", strokeWidth: strokeW + 6 })}
            </g>
          );
        const label = (
          <text
            x={fmt(lp[0])}
            y={fmt(lp[1])}
            dy="0.34em"
            textAnchor="middle"
            style={{
              fontFamily: SERIF,
              fontStyle: "italic",
              fontSize,
              fontWeight: on ? 700 : 400,
              fill: on ? ACCENT : INK,
              stroke: PAPER,
              strokeWidth: 2.6 * k,
              strokeLinejoin: "round",
              paintOrder: "stroke",
              cursor: "default",
            }}
          >
            {site.letter}
          </text>
        );
        return { letter: site.letter, k: site.k, marks: marksEl, label, handlers, tip };
      })
    : [];

  return (
    <svg
      className={className}
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label={`Symmetry diagram of plane group ${group.name}`}
      style={{ display: "block", overflow: "visible" }}
    >
      <title>{`${group.name} (${group.orbifold ?? ""})`}</title>
      {showAsym && (
        <polygon
          points={pts(poly.map(toScreen))}
          style={{ fill: ASYM, fillOpacity: 0.42, stroke: ASYM, strokeWidth: 1 * k, strokeLinejoin: "round" }}
        />
      )}
      <g>{grid}</g>
      <g style={{ strokeDasharray: `${fmt(5 * k)} ${fmt(3.2 * k)}` }}>
        {el.glides.map((l, i) => line(l.p, l.q, `g${i}`, { stroke: INK, strokeWidth: 1.15 * k }))}
      </g>
      <g>{el.mirrors.map((l, i) => line(l.p, l.q, `m${i}`, { stroke: INK, strokeWidth: 2.1 * k }))}</g>
      {siteLayers
        .filter((s) => s.k === 1)
        .map((s) => (
          <g key={s.letter} {...s.handlers}>
            <title>{s.tip}</title>
            {s.marks}
          </g>
        ))}
      <g style={{ fill: INK, stroke: PAPER, strokeWidth: 1.3 * k, strokeLinejoin: "round", paintOrder: "stroke" }}>
        {el.rotations.map((rc, i) => (
          <path key={i} d={symbolPath(rc.order, toScreen(rc.pos), dirs[i], r)} />
        ))}
      </g>
      {siteLayers
        .filter((s) => s.k === 0)
        .map((s) => (
          <g key={s.letter} {...s.handlers}>
            <title>{s.tip}</title>
            {s.marks}
          </g>
        ))}
      {showWyckoff && active === general.letter && (
        <g style={{ fill: ACCENT }}>
          {genericOrbit.map((p, i) => {
            const c = toScreen(p);
            return <circle key={i} cx={fmt(c[0])} cy={fmt(c[1])} r={fmt(Math.max(1.6, 0.42 * r))} />;
          })}
        </g>
      )}
      {siteLayers.map((s) => (
        <g key={s.letter} {...s.handlers}>
          <title>{s.tip}</title>
          {s.label}
        </g>
      ))}
    </svg>
  );
}
