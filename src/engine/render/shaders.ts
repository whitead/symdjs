// Render shaders. Particle positions are reconstructed in the vertex shader
// from the simulation buffers: instance → (tile, image) → op · s_rep + n → B s.

import { makeLayout } from "../gpu/layout";
import { structsWgsl } from "../gpu/wgsl";

export const MAX_COLORS = 16;

const viewStruct = /* wgsl */ `
struct View {
  center: vec2f,
  scale: vec2f,
  tileOrigin: vec2i,
  tileCount: vec2u,
  slot: u32,
  nCell: u32,
  colorMode: u32,
  nColors: u32,
  radius: f32,
  pxPerSigma: f32,
  highlightRep: i32,
  flags: u32,
  ghostAlpha: f32,
  time: f32,
  nReps: u32,
  pad: u32,
  ink: vec4f,
  palette: array<vec4f, ${MAX_COLORS}>,
}
`;

export function discShader(): string {
  const L = makeLayout(2);
  return /* wgsl */ `
${structsWgsl(L)}
${viewStruct}
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> box: array<Box>;
@group(0) @binding(2) var<storage, read> topo: array<u32>;
@group(0) @binding(3) var<storage, read> pos: array<vec2f>;

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) color: vec4f,
  @location(2) @interpolate(flat) kind: u32,
}

fn tf(off: u32) -> f32 { return bitcast<f32>(topo[view.slot * TOPO_STRIDE + off]); }

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VSOut {
  let q = ii % view.nCell;
  let tile = ii / view.nCell;
  let tx = i32(tile % view.tileCount.x) + view.tileOrigin.x;
  let ty = i32(tile / view.tileCount.x) + view.tileOrigin.y;
  let w = topo[view.slot * TOPO_STRIDE + OFF_IMG + q];
  let j = w & 0xffffu;
  let g = w >> 16u;
  let o = OFF_OPS + g * OPW;
  let R = mat2x2f(vec2f(tf(o), tf(o + 2u)), vec2f(tf(o + 1u), tf(o + 3u)));
  let tt = vec2f(tf(o + 4u), tf(o + 5u));
  let s = fract(R * pos[view.slot * NMAX + j] + tt) + vec2f(f32(tx), f32(ty));
  let b = box[view.slot].B;
  let B = mat2x2f(vec2f(b[0], b[2]), vec2f(b[1], b[3]));
  let qc = B * s;
  var corners = array<vec2f, 4>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(1.0, 1.0));
  let c = corners[vi];
  var out: VSOut;
  let pad = 1.0 + 2.0 / max(1.0, view.radius * view.pxPerSigma);
  out.position = vec4f((qc - view.center + c * view.radius * pad) * view.scale, 0.0, 1.0);
  out.local = c * pad;
  var idx = j;
  if (view.colorMode == 1u) { idx = g; }
  else if (view.colorMode == 2u) { idx = topo[view.slot * TOPO_STRIDE + OFF_SITEOF + j] & 255u; }
  var col = view.palette[idx % max(view.nColors, 1u)];
  if (view.colorMode == 3u) { col = view.ink; }
  var kind = 0u;
  if (g == 0u && tx == 0 && ty == 0) { kind = 1u; }
  if (i32(j) == view.highlightRep) { kind = kind | 2u; }
  out.color = col;
  out.kind = kind;
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  let r = length(in.local);
  let aa = 1.6 / max(1.0, view.radius * view.pxPerSigma);
  let alpha = 1.0 - smoothstep(1.0 - aa, 1.0, r);
  if (alpha <= 0.0) { discard; }
  var col = in.color.rgb;
  // engraved-dot shading: soft highlight up-left, darker rim
  let hl = 1.0 - smoothstep(0.0, 0.75, length(in.local - vec2f(-0.35, 0.4)));
  col = mix(col, vec3f(1.0), 0.18 * hl);
  let rim = smoothstep(0.62, 1.0, r);
  col = mix(col, col * 0.62, rim * 0.55);
  var a = alpha;
  let isRep = (in.kind & 1u) != 0u;
  if ((view.flags & 1u) != 0u && isRep) {
    // ink ring marks the asymmetric-unit particles
    let ring = smoothstep(0.70 - aa, 0.70, r) * (1.0 - smoothstep(0.86, 0.86 + aa, r));
    col = mix(col, view.ink.rgb, ring);
  }
  if ((view.flags & 2u) != 0u && !isRep) { a = a * view.ghostAlpha; }
  if ((in.kind & 2u) != 0u) {
    let ring = smoothstep(0.80 - aa, 0.80, r);
    col = mix(col, view.ink.rgb, ring);
  }
  return vec4f(col * a, a);
}
`;
}

/** Thick line segments given in fractional coordinates, mapped through the live box. */
export function lineShader(): string {
  const L = makeLayout(2);
  return /* wgsl */ `
${structsWgsl(L)}
${viewStruct}
struct Seg { a: vec2f, b: vec2f, color: vec4f, width: f32, dash: f32, pad0: f32, pad1: f32 }
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> box: array<Box>;
@group(0) @binding(2) var<storage, read> segs: array<Seg>;

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
  @location(1) along: f32,
  @location(2) @interpolate(flat) dash: f32,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VSOut {
  let sg = segs[ii];
  let b = box[view.slot].B;
  let B = mat2x2f(vec2f(b[0], b[2]), vec2f(b[1], b[3]));
  let pa = (B * sg.a - view.center) * view.scale;
  let pb = (B * sg.b - view.center) * view.scale;
  // NDC per pixel (scale is NDC per σ)
  let px = view.scale / view.pxPerSigma;
  let d = (pb - pa) / px;
  let len = max(length(d), 1e-6);
  let nrm = vec2f(-d.y, d.x) / len;
  var ends = array<f32, 4>(0.0, 1.0, 0.0, 1.0);
  var sides = array<f32, 4>(-1.0, -1.0, 1.0, 1.0);
  let e = ends[vi];
  let p = mix(pa, pb, e) + nrm * sides[vi] * sg.width * 0.5 * px;
  var out: VSOut;
  out.position = vec4f(p, 0.0, 1.0);
  out.color = sg.color;
  out.along = e * len;
  out.dash = sg.dash;
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  var a = in.color.a;
  if (in.dash > 0.0) {
    let ph = fract(in.along / in.dash);
    a = a * (1.0 - smoothstep(0.55, 0.62, ph));
  }
  return vec4f(in.color.rgb * a, a);
}
`;
}
