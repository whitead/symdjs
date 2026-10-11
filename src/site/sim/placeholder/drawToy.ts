// ============================================================================
// PLACEHOLDER RENDERER (Canvas2D): delete with toySim.ts when the WebGPU
// instanced-disc renderer lands. Draws the toy scene as engraved, hand-
// coloured discs on paper, with lattice rules and the asymmetric unit.
// ============================================================================

import { applyAffine } from "../../../engine/math/affine";
import { INK, PALETTE, mixHex } from "../../lib/palette";
import type { ToyScene } from "./toySim";

export interface ToyView {
  /** device pixels per σ */
  scale: number;
  /** device-pixel position of fractional origin (0, 0) */
  ox: number;
  oy: number;
  width: number;
  height: number;
  dpr: number;
}

export interface ToyStyle {
  /** alpha of the lattice rules (0 hides them) */
  grid: number;
  /** outline the home cell (tile 0, 0) */
  homeCell: boolean;
  /** hatch the asymmetric unit of the home cell */
  asym: boolean;
  /** which particles to draw */
  scope: "reps" | "cell" | "all";
  /** alpha of images (non-identity ops) in the home cell */
  ghostAlpha: number;
  /** alpha of particles outside the home cell */
  tileAlpha: number;
  /** dashed lines along the occupied mirror-line Wyckoff sites */
  siteLines: boolean;
  /** rings around the independent particles */
  repRings: boolean;
  /** drawn diameter / σ */
  disc: number;
  /** draw the lattice rules over the particles (shows the box deforming) */
  gridOver: boolean;
  /** dim general-position particles so Wyckoff-site particles stand out */
  emphasizeSites: boolean;
}

export const DEFAULT_STYLE: ToyStyle = {
  grid: 0.07,
  homeCell: false,
  asym: false,
  scope: "all",
  ghostAlpha: 1,
  tileAlpha: 1,
  siteLines: false,
  repRings: false,
  disc: 0.9,
  gridOver: false,
  emphasizeSites: false,
};

/** Drawn disc positions for hit-testing: x, y, rep, op, nx, ny. */
export interface HitBuffer {
  data: Float64Array;
  count: number;
}

const sprites = new Map<string, HTMLCanvasElement>();

function sprite(color: string, r: number): HTMLCanvasElement {
  const key = `${color}|${r.toFixed(2)}`;
  let c = sprites.get(key);
  if (c) return c;
  const size = Math.ceil(2 * r + 4);
  c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const cx = size / 2;
  const lw = Math.max(1, r * 0.11);
  g.beginPath();
  g.arc(cx, cx, r - lw / 2, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
  // gentle shading, like a wash that pools at the lower edge
  const shade = g.createRadialGradient(cx - r * 0.35, cx - r * 0.4, r * 0.05, cx, cx, r);
  shade.addColorStop(0, "rgba(255,255,255,0.34)");
  shade.addColorStop(0.5, "rgba(255,255,255,0)");
  shade.addColorStop(1, "rgba(31,36,48,0.16)");
  g.fillStyle = shade;
  g.fill();
  g.lineWidth = lw;
  g.strokeStyle = mixHex(color, INK, 0.55);
  g.stroke();
  sprites.set(key, c);
  return c;
}

let hatchCache: { dpr: number; pattern: CanvasPattern | null } | null = null;

function hatch(ctx: CanvasRenderingContext2D, dpr: number): CanvasPattern | null {
  if (hatchCache && hatchCache.dpr === dpr) return hatchCache.pattern;
  const n = Math.round(7 * dpr);
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d")!;
  g.strokeStyle = "rgba(31,36,48,0.22)";
  g.lineWidth = Math.max(1, dpr * 0.8);
  g.beginPath();
  g.moveTo(0, n);
  g.lineTo(n, 0);
  g.moveTo(-n / 2, n / 2);
  g.lineTo(n / 2, -n / 2);
  g.moveTo(n / 2, n * 1.5);
  g.lineTo(n * 1.5, n / 2);
  g.stroke();
  const pattern = ctx.createPattern(c, "repeat");
  hatchCache = { dpr, pattern };
  return pattern;
}

/** fractional → device px */
function toPx(sc: ToyScene, v: ToyView, fx: number, fy: number): [number, number] {
  const { B } = sc;
  return [v.ox + v.scale * (B[0] * fx + B[1] * fy), v.oy - v.scale * (B[2] * fx + B[3] * fy)];
}

/** Range of lattice tiles that covers the viewport (plus a margin). */
function tileRange(sc: ToyScene, v: ToyView, margin: number): [number, number, number, number] {
  const { Binv } = sc;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [px, py] of [
    [0, 0],
    [v.width, 0],
    [0, v.height],
    [v.width, v.height],
  ]) {
    const cx = (px - v.ox) / v.scale;
    const cy = -(py - v.oy) / v.scale;
    const fx = Binv[0] * cx + Binv[1] * cy;
    const fy = Binv[2] * cx + Binv[3] * cy;
    x0 = Math.min(x0, fx);
    x1 = Math.max(x1, fx);
    y0 = Math.min(y0, fy);
    y1 = Math.max(y1, fy);
  }
  return [Math.floor(x0) - margin, Math.ceil(x1) + margin, Math.floor(y0) - margin, Math.ceil(y1) + margin];
}

export function drawToy(
  ctx: CanvasRenderingContext2D,
  sc: ToyScene,
  v: ToyView,
  style: ToyStyle,
  hits?: HitBuffer,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, v.width, v.height);
  const [i0, i1, j0, j1] = tileRange(sc, v, 1);
  const dpr = v.dpr;

  const drawGrid = (alpha: number) => {
    ctx.strokeStyle = `rgba(31,36,48,${alpha})`;
    ctx.lineWidth = Math.max(1, dpr * 0.75);
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) {
      const [ax, ay] = toPx(sc, v, i, j0);
      const [bx, by] = toPx(sc, v, i, j1);
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    }
    for (let j = j0; j <= j1; j++) {
      const [ax, ay] = toPx(sc, v, i0, j);
      const [bx, by] = toPx(sc, v, i1, j);
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    }
    ctx.stroke();
  };

  // lattice rules
  if (style.grid > 0 && !style.gridOver) drawGrid(style.grid);

  // asymmetric unit of the home cell
  if (style.asym && sc.group.asymPolygon) {
    ctx.beginPath();
    sc.group.asymPolygon.forEach(([fx, fy], k) => {
      const [x, y] = toPx(sc, v, fx, fy);
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(249,199,79,0.16)";
    ctx.fill();
    const p = hatch(ctx, dpr);
    if (p) {
      ctx.fillStyle = p;
      ctx.fill();
    }
    ctx.setLineDash([4 * dpr, 3 * dpr]);
    ctx.strokeStyle = "rgba(31,36,48,0.55)";
    ctx.lineWidth = Math.max(1, dpr);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // particles
  const rDev = (style.disc * v.scale) / 2;
  const pad = rDev + 2;
  const tmp = new Float64Array(2);
  if (hits) hits.count = 0;
  const { B } = sc;
  for (let ri = 0; ri < sc.reps.length; ri++) {
    const rep = sc.reps[ri];
    const spr = sprite(PALETTE[rep.color % PALETTE.length], rDev);
    const half = spr.width / 2;
    for (let oi = 0; oi < rep.ops.length; oi++) {
      const o = rep.ops[oi];
      if (style.scope === "reps" && oi > 0) break;
      applyAffine(sc.ops[o], rep.s, tmp);
      // image in the home cell, then translate through tiles
      const fx = tmp[0] - Math.floor(tmp[0]);
      const fy = tmp[1] - Math.floor(tmp[1]);
      const dim = style.emphasizeSites && rep.site.general ? 0.3 : 1;
      const homeAlpha = (oi === 0 ? 1 : style.ghostAlpha) * dim;
      const ti0 = style.scope === "all" ? i0 : 0;
      const ti1 = style.scope === "all" ? i1 : 0;
      const tj0 = style.scope === "all" ? j0 : 0;
      const tj1 = style.scope === "all" ? j1 : 0;
      for (let i = ti0; i <= ti1; i++)
        for (let j = tj0; j <= tj1; j++) {
          const ax = fx + i;
          const ay = fy + j;
          const x = v.ox + v.scale * (B[0] * ax + B[1] * ay);
          const y = v.oy - v.scale * (B[2] * ax + B[3] * ay);
          if (x < -pad || y < -pad || x > v.width + pad || y > v.height + pad) continue;
          const home = i === 0 && j === 0;
          ctx.globalAlpha = home ? homeAlpha : style.tileAlpha * dim;
          ctx.drawImage(spr, x - half, y - half);
          if (hits) {
            if (hits.data.length < (hits.count + 1) * 6) {
              const grown = new Float64Array(Math.max(1024, hits.data.length * 2));
              grown.set(hits.data);
              hits.data = grown;
            }
            const k = hits.count++ * 6;
            hits.data[k] = x;
            hits.data[k + 1] = y;
            hits.data[k + 2] = ri;
            hits.data[k + 3] = o;
            // lattice translation from the unwrapped op image to this copy
            hits.data[k + 4] = i - Math.floor(tmp[0]);
            hits.data[k + 5] = j - Math.floor(tmp[1]);
          }
        }
    }
  }
  ctx.globalAlpha = 1;

  // mirror-line Wyckoff sites (deduplicated across tiles)
  if (style.siteLines) {
    const seen = new Set<string>();
    ctx.beginPath();
    const big = Math.hypot(v.width, v.height);
    for (const r of sc.reps) {
      if (r.site.general || r.site.k !== 1) continue;
      for (const o of r.ops) {
        const p0 = applyAffine(sc.ops[o], r.site.t);
        const p1 = applyAffine(sc.ops[o], [r.site.t[0] + r.site.L[0], r.site.t[1] + r.site.L[1]]);
        for (let i = i0; i <= i1; i++)
          for (let j = j0; j <= j1; j++) {
            const [ax, ay] = toPx(sc, v, p0[0] + i, p0[1] + j);
            const [bx, by] = toPx(sc, v, p1[0] + i, p1[1] + j);
            let dx = bx - ax;
            let dy = by - ay;
            const len = Math.hypot(dx, dy);
            dx /= len;
            dy /= len;
            if (dx < -1e-9 || (Math.abs(dx) < 1e-9 && dy < 0)) {
              dx = -dx;
              dy = -dy;
            }
            const off = -dy * ax + dx * ay;
            const key = `${dx.toFixed(3)},${dy.toFixed(3)},${Math.round(off)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            ctx.moveTo(ax - dx * big, ay - dy * big);
            ctx.lineTo(ax + dx * big, ay + dy * big);
          }
      }
    }
    ctx.setLineDash([7 * dpr, 4 * dpr]);
    ctx.strokeStyle = "rgba(39,56,80,0.8)";
    ctx.lineWidth = Math.max(1, dpr * 1.4);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // independent particles
  if (style.repRings) {
    ctx.strokeStyle = "rgba(31,36,48,0.8)";
    ctx.lineWidth = Math.max(1, dpr * 1.2);
    ctx.beginPath();
    for (const rep of sc.reps) {
      if (style.emphasizeSites && rep.site.general) continue;
      const [x, y] = toPx(sc, v, rep.s[0], rep.s[1]);
      ctx.moveTo(x + rDev + 3 * dpr, y);
      ctx.arc(x, y, rDev + 3 * dpr, 0, Math.PI * 2);
    }
    ctx.stroke();
  }

  if (style.grid > 0 && style.gridOver) drawGrid(style.grid);

  // home cell outline
  if (style.homeCell) {
    ctx.beginPath();
    const corners: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    corners.forEach(([fx, fy], k) => {
      const [x, y] = toPx(sc, v, fx, fy);
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = "rgba(31,36,48,0.7)";
    ctx.lineWidth = Math.max(1, dpr * 1.25);
    ctx.stroke();
  }
}

/** Device-pixel origin that centres the home cell at (cx, cy). */
export function centredOrigin(sc: ToyScene, scale: number, cx: number, cy: number): [number, number] {
  const { B } = sc;
  return [cx - scale * 0.5 * (B[0] + B[1]), cy + scale * 0.5 * (B[2] + B[3])];
}

/** Device pixel → fractional coordinates. */
export function pxToFrac(sc: ToyScene, v: ToyView, px: number, py: number): [number, number] {
  const cx = (px - v.ox) / v.scale;
  const cy = -(py - v.oy) / v.scale;
  const { Binv } = sc;
  return [Binv[0] * cx + Binv[1] * cy, Binv[2] * cx + Binv[3] * cy];
}
