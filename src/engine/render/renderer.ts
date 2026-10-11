// Canvas views of GPU systems. Each <canvas> gets its own WebGPU context on
// the shared device; particles are drawn as instanced discs whose positions
// come straight from the simulation buffers (no readback).

import { inverse } from "../math/linalg";
import { boxFromParams } from "../groups/bravais";
import type { GpuEngine, GpuSystem } from "../gpu/engine";
import { discShader, lineShader, MAX_COLORS } from "./shaders";

export type ColorMode = "rep" | "op" | "site" | "ink";

export interface ViewOptions {
  /** σ visible across the shorter canvas side */
  span: number;
  colorMode: ColorMode;
  /** disc radius in σ */
  radius: number;
  /** Cartesian point at the view centre */
  center: [number, number];
  showGrid: boolean;
  showCell: boolean;
  showAsym: boolean;
  /** ink ring on the asymmetric-unit particles (identity image in the home cell) */
  markReps: boolean;
  /** alpha for non-asymmetric-unit particles (1 = no dimming) */
  ghostAlpha: number;
  palette: string[];
  ink: string;
  paper: string | null;
  highlightRep: number;
  maxDpr: number;
  /** draw only the home unit cell (no lattice copies) */
  homeOnly: boolean;
  /** CSS pixels per σ; overrides `span` when > 0 */
  cssPxPerSigma: number;
  /** grid line opacity */
  gridAlpha: number;
  /** alpha for particles outside the home cell (1 = no dimming) */
  tileAlpha: number;
  /** alpha for particles on the general position (1 = no dimming) */
  generalAlpha: number;
  /** keep the home cell centred in the view (follows the live box) */
  centerCell: boolean;
  /** size the canvas backing store from its CSS box (off when the page manages it) */
  manageSize: boolean;
}

/** The paper's Figure 2 palette, ordered so consecutive indices contrast. */
export const PALETTE = ["#f94144", "#277da1", "#f9c74f", "#43aa8b", "#f3722c", "#577590", "#90be6d", "#f8961e", "#4d908e", "#f9844a"];

export const defaultViewOptions: ViewOptions = {
  span: 16,
  colorMode: "rep",
  radius: 0.5,
  center: [0, 0],
  showGrid: false,
  showCell: true,
  showAsym: false,
  markReps: false,
  ghostAlpha: 1,
  palette: PALETTE,
  ink: "#1f2430",
  paper: null,
  highlightRep: -1,
  maxDpr: 2,
  homeOnly: false,
  cssPxPerSigma: 0,
  gridAlpha: 0.1,
  tileAlpha: 1,
  generalAlpha: 1,
  centerCell: false,
  manageSize: true,
};

function hexToRgba(hex: string, alpha = 1): [number, number, number, number] {
  const h = hex.replace("#", "");
  const v = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255, alpha];
}

const VIEW_BYTES = 112 + MAX_COLORS * 16;
const SEG_FLOATS = 12;
const MAX_SEGS = 1024;

export class Renderer {
  readonly format: GPUTextureFormat;
  readonly discPipeline: GPURenderPipeline;
  readonly linePipeline: GPURenderPipeline;

  constructor(readonly engine: GpuEngine) {
    const device = engine.device;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    const blend: GPUBlendState = {
      color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
      alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
    };
    const mk = (code: string, label: string) => {
      const module = device.createShaderModule({ code, label });
      module.getCompilationInfo().then((info) => {
        for (const m of info.messages) if (m.type === "error") console.error(`${label} ${m.lineNum}:${m.linePos} ${m.message}`);
      });
      return device.createRenderPipeline({
        label,
        layout: "auto",
        vertex: { module, entryPoint: "vs" },
        fragment: { module, entryPoint: "fs", targets: [{ format: this.format, blend }] },
        primitive: { topology: "triangle-strip" },
      });
    };
    this.discPipeline = mk(discShader(), "discs");
    this.linePipeline = mk(lineShader(), "lines");
  }
}

export class SimView {
  readonly ctx: GPUCanvasContext;
  opts: ViewOptions;
  visible = true;
  private viewBuf: GPUBuffer;
  private segBuf: GPUBuffer;
  private discBG: GPUBindGroup;
  private lineBG: GPUBindGroup;
  private viewData = new ArrayBuffer(VIEW_BYTES);
  private segData = new Float32Array(MAX_SEGS * SEG_FLOATS);
  private nGrid = 0;
  private nOver = 0;
  private segKey = "";
  private B0: Float64Array;
  /** current mapping (for pointer → simulation coordinates) */
  pxPerSigma = 1;
  /** called at the start of every render (e.g. to animate the camera) */
  onBeforeRender: ((v: SimView) => void) | null = null;
  size: [number, number] = [1, 1];

  constructor(
    readonly renderer: Renderer,
    readonly canvas: HTMLCanvasElement,
    public sys: GpuSystem,
    opts: Partial<ViewOptions> = {},
  ) {
    this.opts = { ...defaultViewOptions, ...opts };
    const device = renderer.engine.device;
    const ctx = canvas.getContext("webgpu");
    if (!ctx) throw new Error("could not create a WebGPU canvas context");
    this.ctx = ctx;
    ctx.configure({ device, format: renderer.format, alphaMode: "premultiplied" });
    this.viewBuf = device.createBuffer({ size: VIEW_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.segBuf = device.createBuffer({ size: MAX_SEGS * SEG_FLOATS * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const e = renderer.engine;
    this.discBG = device.createBindGroup({
      layout: renderer.discPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.viewBuf } },
        { binding: 1, resource: { buffer: e.boxBuf } },
        { binding: 2, resource: { buffer: e.topoBuf } },
        { binding: 3, resource: { buffer: e.posBuf } },
      ],
    });
    this.lineBG = device.createBindGroup({
      layout: renderer.linePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.viewBuf } },
        { binding: 1, resource: { buffer: e.boxBuf } },
        { binding: 2, resource: { buffer: this.segBuf } },
      ],
    });
    this.B0 = this.initialB();
  }

  private initialB(): Float64Array {
    const lp = this.sys.group.latticeParams;
    return boxFromParams(lp, this.sys.initialP);
  }

  setSystem(sys: GpuSystem) {
    this.sys = sys;
    this.B0 = this.initialB();
    this.segKey = "";
  }

  setOptions(o: Partial<ViewOptions>) {
    this.opts = { ...this.opts, ...o };
    this.segKey = "";
  }

  /** best current estimate of the lattice (readback lags a few frames) */
  get B(): Float64Array {
    return this.sys.stats?.B ?? this.B0;
  }

  private resize(): [number, number] {
    if (!this.opts.manageSize) return [Math.max(1, this.canvas.width), Math.max(1, this.canvas.height)];
    const dpr = Math.min(window.devicePixelRatio || 1, this.opts.maxDpr);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    return [w, h];
  }

  /** Pixel (CSS px, relative to canvas) → Cartesian simulation coordinates. */
  toSim(x: number, y: number): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    const sx = (x / rect.width) * this.size[0];
    const sy = (y / rect.height) * this.size[1];
    return [
      this.opts.center[0] + (sx - this.size[0] / 2) / this.pxPerSigma,
      this.opts.center[1] - (sy - this.size[1] / 2) / this.pxPerSigma,
    ];
  }

  render(encoder: GPUCommandEncoder) {
    this.onBeforeRender?.(this);
    const [w, h] = this.resize();
    this.size = [w, h];
    const o = this.opts;
    if (o.centerCell) {
      const Bc = this.B;
      o.center = [0.5 * (Bc[0] + Bc[1]), 0.5 * (Bc[2] + Bc[3])];
    }
    const dprNow = w / Math.max(1, this.canvas.clientWidth);
    const pxPerSigma = o.cssPxPerSigma > 0 ? o.cssPxPerSigma * dprNow : Math.min(w, h) / o.span;
    this.pxPerSigma = pxPerSigma;
    const sys = this.sys;
    const { nCell, n } = sys.data;
    // tile range covering the view
    const B = this.B;
    const Bi = inverse(B, 2);
    const hw = w / 2 / pxPerSigma + 2 * o.radius;
    const hh = h / 2 / pxPerSigma + 2 * o.radius;
    let fx0 = Infinity;
    let fx1 = -Infinity;
    let fy0 = Infinity;
    let fy1 = -Infinity;
    for (const [cx, cy] of [
      [-hw, -hh],
      [hw, -hh],
      [-hw, hh],
      [hw, hh],
    ]) {
      const x = o.center[0] + cx;
      const y = o.center[1] + cy;
      const fx = Bi[0] * x + Bi[1] * y;
      const fy = Bi[2] * x + Bi[3] * y;
      fx0 = Math.min(fx0, fx);
      fx1 = Math.max(fx1, fx);
      fy0 = Math.min(fy0, fy);
      fy1 = Math.max(fy1, fy);
    }
    // margin of one tile for box changes not yet read back
    let x0 = Math.floor(fx0) - 1;
    let y0 = Math.floor(fy0) - 1;
    let nx = Math.ceil(fx1) - x0 + 1;
    let ny = Math.ceil(fy1) - y0 + 1;
    // cap the instance count, keeping the kept tiles centred on the view
    const MAXT = 80;
    if (nx > MAXT) {
      x0 += Math.floor((nx - MAXT) / 2);
      nx = MAXT;
    }
    if (ny > MAXT) {
      y0 += Math.floor((ny - MAXT) / 2);
      ny = MAXT;
    }
    if (o.homeOnly) {
      x0 = 0;
      y0 = 0;
      nx = 1;
      ny = 1;
    }

    // uniforms
    const f = new Float32Array(this.viewData);
    const u = new Uint32Array(this.viewData);
    const i32 = new Int32Array(this.viewData);
    f[0] = o.center[0];
    f[1] = o.center[1];
    f[2] = (2 * pxPerSigma) / w;
    f[3] = (2 * pxPerSigma) / h;
    i32[4] = x0;
    i32[5] = y0;
    u[6] = nx;
    u[7] = ny;
    u[8] = sys.slot;
    u[9] = nCell;
    u[10] = { rep: 0, op: 1, site: 2, ink: 3 }[o.colorMode];
    u[11] = Math.min(o.palette.length, MAX_COLORS);
    f[12] = o.radius;
    f[13] = pxPerSigma;
    i32[14] = o.highlightRep;
    u[15] =
      (o.markReps ? 1 : 0) | (o.ghostAlpha < 0.999 ? 2 : 0) | (o.tileAlpha < 0.999 ? 4 : 0) | (o.generalAlpha < 0.999 ? 8 : 0);
    f[16] = o.ghostAlpha;
    f[17] = performance.now() / 1000;
    u[18] = n;
    u[19] = sys.group.sites.length - 1;
    f.set(hexToRgba(o.ink), 20);
    f[24] = o.tileAlpha;
    f[25] = o.generalAlpha;
    o.palette.slice(0, MAX_COLORS).forEach((c, i) => f.set(hexToRgba(c), 28 + i * 4));
    const device = this.renderer.engine.device;
    device.queue.writeBuffer(this.viewBuf, 0, this.viewData);

    // overlay segments (fractional coordinates; the shader applies the live box)
    const key = `${x0},${y0},${nx},${ny},${o.showGrid},${o.gridAlpha},${o.showCell},${o.showAsym},${o.ink}`;
    if (key !== this.segKey) {
      this.segKey = key;
      this.buildSegments(x0, y0, nx, ny);
    }

    const tex = this.ctx.getCurrentTexture();
    const paper = o.paper ? hexToRgba(o.paper) : [0, 0, 0, 0];
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: tex.createView(),
          clearValue: { r: paper[0] * paper[3], g: paper[1] * paper[3], b: paper[2] * paper[3], a: paper[3] },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    if (this.nGrid > 0) {
      pass.setPipeline(this.renderer.linePipeline);
      pass.setBindGroup(0, this.lineBG);
      pass.draw(4, this.nGrid, 0, 0);
    }
    pass.setPipeline(this.renderer.discPipeline);
    pass.setBindGroup(0, this.discBG);
    pass.draw(4, nCell * nx * ny, 0, 0);
    if (this.nOver > 0) {
      pass.setPipeline(this.renderer.linePipeline);
      pass.setBindGroup(0, this.lineBG);
      pass.draw(4, this.nOver, 0, this.nGrid);
    }
    pass.end();
  }

  private buildSegments(x0: number, y0: number, nx: number, ny: number) {
    const o = this.opts;
    const d = this.segData;
    let k = 0;
    const push = (a: number[], b: number[], color: [number, number, number, number], width: number, dash = 0) => {
      if (k >= MAX_SEGS) return;
      d.set([a[0], a[1], b[0], b[1], ...color, width, dash, 0, 0], k * SEG_FLOATS);
      k++;
    };
    const dpr = Math.min(window.devicePixelRatio || 1, o.maxDpr);
    if (o.showGrid) {
      const c = hexToRgba(o.ink, o.gridAlpha);
      for (let i = 0; i <= nx; i++) push([x0 + i, y0], [x0 + i, y0 + ny], c, 1 * dpr);
      for (let j = 0; j <= ny; j++) push([x0, y0 + j], [x0 + nx, y0 + j], c, 1 * dpr);
    }
    this.nGrid = k;
    if (o.showAsym && this.sys.group.asymPolygon) {
      const poly = this.sys.group.asymPolygon;
      const c = hexToRgba(o.ink, 0.75);
      poly.forEach((p, i) => push(p, poly[(i + 1) % poly.length], c, 1.5 * dpr, 6 * dpr));
    }
    if (o.showCell) {
      const c = hexToRgba(o.ink, 0.85);
      const pts = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ];
      pts.forEach((p, i) => push(p, pts[(i + 1) % 4], c, 1.6 * dpr));
    }
    this.nOver = k - this.nGrid;
    this.renderer.engine.device.queue.writeBuffer(this.segBuf, 0, d, 0, k * SEG_FLOATS);
  }

  dispose() {
    this.viewBuf.destroy();
    this.segBuf.destroy();
    this.ctx.unconfigure();
  }
}
