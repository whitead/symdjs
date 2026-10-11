// WebGPU engine: many symmetric systems share one device and one set of
// buffers. Each frame, a single dispatch advances every active system by
// its own number of steps (one workgroup per system).

import { linearPart, translationPart } from "../math/affine";
import { potentialParams } from "../core/potentials";
import { ProtocolRunner, type Protocol } from "../core/protocol";
import { boxFromParams } from "../groups/bravais";
import { det } from "../math/linalg";
import {
  buildSystemData,
  defaultParams,
  initialState,
  positionOf,
  type SimParams,
  type SystemData,
  type SystemSpec,
  type SystemState,
} from "../core/system";
import type { Group } from "../groups/group";
import { BOX, FLAG_MC_ADAPT, makeLayout, SYS, type Layout } from "./layout";
import { simShaderSource } from "./wgsl";

export interface GpuStats {
  step: number;
  pe: number;
  ke: number;
  T: number;
  V: number;
  rho: number;
  accept: number;
  delta: number;
  /** lattice matrix, row-major D×D */
  B: Float64Array;
  /** bit 0: NaN/explosion, bit 1: box too small for cutoff */
  status: number;
}

export class GpuSystem {
  /** host-side step counter (matches the CPU engine's state.step) */
  step = 0;
  stats: GpuStats | null = null;
  runner: ProtocolRunner | null = null;
  /** pointer touch: a soft repulsive probe (and all its symmetric images) at a fractional position */
  probe: { at: [number, number]; strength: number; width: number } | null = null;
  paramsDirty = true;
  disposed = false;
  label = "";
  /** lattice parameters at the last upload (used before the first stats readback) */
  initialP = new Float64Array(0);
  /** has the kernel run on the current state (energies are only known after a dispatch) */
  dispatched = false;

  constructor(
    readonly engine: GpuEngine,
    readonly slot: number,
    readonly data: SystemData,
    public params: SimParams,
    readonly seed: number,
  ) {}

  get group(): Group {
    return this.data.group;
  }

  setParams(p: Partial<SimParams>) {
    this.params = { ...this.params, ...p };
    this.paramsDirty = true;
  }

  setProtocol(protocol: Protocol | null) {
    this.runner = protocol ? new ProtocolRunner(protocol, this.data.nCell / Math.max(1, this.data.n)) : null;
  }

  dispose() {
    this.engine.remove(this);
  }
}

export interface StepRequest {
  sys: GpuSystem;
  steps: number;
}

export class GpuEngine {
  readonly layout: Layout;
  readonly sysBuf: GPUBuffer;
  readonly boxBuf: GPUBuffer;
  readonly topoBuf: GPUBuffer;
  readonly repsBuf: GPUBuffer;
  readonly posBuf: GPUBuffer;
  private activeBuf: GPUBuffer;
  private pipeline: GPUComputePipeline;
  private bindGroup: GPUBindGroup;
  private slots: (GpuSystem | null)[];
  private statsStaging: GPUBuffer[] = [];
  private statsBusy: boolean[] = [];
  private statsSlotsAtCopy: (GpuSystem | null)[][] = [];
  private sysScratch: ArrayBuffer;
  lost = false;

  static async create(): Promise<GpuEngine> {
    if (!navigator.gpu) throw new Error("WebGPU is not available");
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("No WebGPU adapter");
    const device = await adapter.requestDevice();
    return new GpuEngine(device);
  }

  constructor(readonly device: GPUDevice) {
    const L = (this.layout = makeLayout(2));
    this.slots = Array(L.MAX_SLOTS).fill(null);
    const S = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    this.sysBuf = device.createBuffer({ size: L.MAX_SLOTS * L.SYSW * 4, usage: S, label: "sys" });
    this.boxBuf = device.createBuffer({ size: L.MAX_SLOTS * L.BOXW * 4, usage: S, label: "box" });
    this.topoBuf = device.createBuffer({ size: L.MAX_SLOTS * L.TOPO_STRIDE * 4, usage: S, label: "topo" });
    this.repsBuf = device.createBuffer({ size: L.MAX_SLOTS * L.NMAX * L.REPW * 4, usage: S, label: "reps" });
    this.posBuf = device.createBuffer({ size: L.MAX_SLOTS * L.NMAX * L.POSW * 4, usage: S, label: "pos" });
    this.activeBuf = device.createBuffer({ size: L.MAX_SLOTS * 4, usage: S, label: "active" });
    this.sysScratch = new ArrayBuffer(L.SYSW * 4);
    const module = device.createShaderModule({ code: simShaderSource(2), label: "symd-sim" });
    module.getCompilationInfo().then((info) => {
      for (const m of info.messages) console[m.type === "error" ? "error" : "warn"](`WGSL ${m.type} ${m.lineNum}:${m.linePos} ${m.message}`);
    });
    device.addEventListener("uncapturederror", (e) => console.error("WebGPU error:", (e as GPUUncapturedErrorEvent).error.message));
    this.pipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "main" } });
    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [this.sysBuf, this.boxBuf, this.topoBuf, this.repsBuf, this.posBuf, this.activeBuf].map((buffer, binding) => ({
        binding,
        resource: { buffer },
      })),
    });
    for (let i = 0; i < 2; i++) {
      this.statsStaging.push(
        device.createBuffer({ size: L.MAX_SLOTS * L.BOXW * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }),
      );
      this.statsBusy.push(false);
      this.statsSlotsAtCopy.push([]);
    }
    device.lost.then(() => (this.lost = true));
  }

  /** Can this configuration run on the GPU? */
  fits(data: SystemData): string | null {
    const L = this.layout;
    if (data.n > L.NMAX) return `too many reps (${data.n} > ${L.NMAX})`;
    if (data.nCell > L.IMGMAX) return `too many particles per cell (${data.nCell} > ${L.IMGMAX})`;
    if (data.group.order > L.OPMAX) return "group too large";
    if (data.group.sites.length > L.SITEMAX) return "too many Wyckoff sites";
    const cosets = data.group.sites.reduce((a, s) => a + s.cosetOps.length, 0);
    if (cosets > L.COSETMAX) return "too many coset ops";
    return null;
  }

  get freeSlots(): number {
    return this.slots.filter((s) => !s).length;
  }

  add(spec: SystemSpec, state?: SystemState): GpuSystem {
    const params = { ...defaultParams, ...spec.params };
    const data = buildSystemData(spec.group, spec.occupancy);
    const why = this.fits(data);
    if (why) throw new Error(why);
    const slot = this.slots.indexOf(null);
    if (slot < 0) throw new Error("no free GPU slots");
    const st = state ?? initialState(data, spec.density, spec.seed, params.T);
    const sys = new GpuSystem(this, slot, data, params, spec.seed >>> 0);
    sys.step = st.step;
    this.slots[slot] = sys;
    this.writeTopology(sys);
    this.uploadState(sys, st);
    return sys;
  }

  remove(sys: GpuSystem) {
    if (this.slots[sys.slot] === sys) this.slots[sys.slot] = null;
    sys.disposed = true;
  }

  private writeTopology(sys: GpuSystem) {
    const L = this.layout;
    const { data } = sys;
    const { group } = data;
    const D = 2;
    const buf = new ArrayBuffer(L.TOPO_STRIDE * 4);
    const f = new Float32Array(buf);
    const u = new Uint32Array(buf);
    group.ops.forEach((op, g) => {
      const R = linearPart(op);
      const t = translationPart(op);
      const o = L.OFF_OPS + g * L.OPW;
      for (let a = 0; a < D * D; a++) f[o + a] = R[a];
      for (let a = 0; a < D; a++) f[o + D * D + a] = t[a];
    });
    let coset = 0;
    group.sites.forEach((site, si) => {
      const o = L.OFF_SITES + si * L.SITEW;
      for (let a = 0; a < D; a++) f[o + a] = site.t[a];
      for (let a = 0; a < D; a++) for (let c = 0; c < site.k; c++) f[o + D + a * D + c] = site.L[a * site.k + c];
      u[o + D + D * D] = site.k;
      u[o + D + D * D + 1] = site.uPeriodic ? 1 : 0;
      u[o + D + D * D + 2] = site.multiplicity;
      u[o + D + D * D + 3] = coset;
      for (const g of site.cosetOps) u[L.OFF_COSETS + coset++] = g;
    });
    for (let i = 0; i < data.n; i++) u[L.OFF_SITEOF + i] = data.siteOf[i] | (data.selfImage[i] << 8);
    for (let e = 0; e < data.nCell; e++) u[L.OFF_IMG + e] = data.imageRep[e] | (data.imageOp[e] << 16);
    this.device.queue.writeBuffer(this.topoBuf, sys.slot * L.TOPO_STRIDE * 4, buf);
  }

  /** Overwrite a system's dynamic state (positions, velocities, box). */
  uploadState(sys: GpuSystem, st: SystemState) {
    const L = this.layout;
    const { n } = sys.data;
    const D = 2;
    const reps = new Float32Array(n * L.REPW);
    for (let i = 0; i < n; i++)
      for (let a = 0; a < D; a++) {
        reps[i * L.REPW + a] = st.u[i * D + a];
        reps[i * L.REPW + 2 + a] = st.v[i * D + a];
      }
    this.device.queue.writeBuffer(this.repsBuf, sys.slot * L.NMAX * L.REPW * 4, reps);
    // box record, including B and V so the system renders before its first step
    const box = new ArrayBuffer(L.BOXW * 4);
    const bf = new Float32Array(box);
    st.p.forEach((v, i) => (bf[BOX.p + i] = v));
    const B = boxFromParams(sys.data.group.latticeParams, st.p);
    for (let i = 0; i < D * D; i++) bf[BOX.B + i] = B[i];
    bf[BOX.V] = Math.abs(det(B, D));
    bf[BOX.delta] = 0.004;
    this.device.queue.writeBuffer(this.boxBuf, sys.slot * L.BOXW * 4, box);
    // positions (s = wrap(t + L u)) for the renderer and picking
    const s = new Float64Array(n * D);
    for (let i = 0; i < n; i++) positionOf(sys.data.group.sites[sys.data.siteOf[i]], st.u, i * D, D, s, i * D);
    const pos = new Float32Array(n * L.POSW);
    for (let i = 0; i < n; i++) for (let a = 0; a < D; a++) pos[i * L.POSW + a] = s[i * D + a];
    this.device.queue.writeBuffer(this.posBuf, sys.slot * L.NMAX * L.POSW * 4, pos);
    sys.step = st.step;
    sys.initialP = Float64Array.from(st.p);
    sys.stats = null;
    sys.dispatched = false;
    sys.paramsDirty = true;
  }

  private writeSys(sys: GpuSystem, steps: number) {
    const L = this.layout;
    const { data, params } = sys;
    const buf = this.sysScratch;
    const f = new Float32Array(buf);
    const u = new Uint32Array(buf);
    const i32 = new Int32Array(buf);
    f.fill(0);
    const pp = potentialParams(params.potential);
    const lp = data.group.latticeParams;
    u[SYS.n] = data.n;
    u[SYS.nCell] = data.nCell;
    u[SYS.nOps] = data.group.order;
    u[SYS.nSites] = data.group.sites.length;
    u[SYS.steps] = steps;
    u[SYS.stepStart] = sys.step;
    u[SYS.seed] = sys.seed;
    u[SYS.nptEvery] = params.P === null ? 0 : params.nptEvery;
    u[SYS.potCode] = pp.code;
    u[SYS.latR] = lp.r;
    u[SYS.flags] = params.mcAdapt ? FLAG_MC_ADAPT : 0;
    i32[SYS.probeOn] = sys.probe ? 1 : 0;
    f[SYS.T] = params.T;
    f[SYS.P] = params.P ?? 0;
    f[SYS.gamma] = params.gamma;
    f[SYS.dt] = params.dt;
    f[SYS.eps] = pp.eps;
    f[SYS.sig] = pp.sig;
    f[SYS.rc] = pp.rc;
    f[SYS.shift] = pp.shift;
    f[SYS.forceCap] = Number.isFinite(params.forceCap) ? params.forceCap : 0;
    f[SYS.probeA] = sys.probe ? sys.probe.strength : 0;
    f[SYS.mcMaxDelta] = params.mcMaxDelta;
    if (sys.probe) {
      f[SYS.probe] = sys.probe.at[0];
      f[SYS.probe + 1] = sys.probe.at[1];
      f[SYS.probe + 2] = sys.probe.width;
    }
    const D2 = 4;
    for (let a = 0; a < D2; a++) for (let c = 0; c < lp.r; c++) f[SYS.M + a * L.RMAX + c] = lp.M[a * lp.r + c];
    this.device.queue.writeBuffer(this.sysBuf, sys.slot * L.SYSW * 4, buf);
  }

  /** Advance systems; protocols (if any) set parameters before each dispatch. */
  step(requests: StepRequest[], encoder?: GPUCommandEncoder): void {
    const list = requests.filter((r) => !r.sys.disposed && r.steps > 0);
    if (!list.length) return;
    const active = new Uint32Array(list.length);
    list.forEach((r, i) => {
      const { sys } = r;
      if (sys.runner) sys.params = { ...sys.params, ...sys.runner.params(r.steps) };
      this.writeSys(sys, r.steps);
      active[i] = sys.slot;
    });
    this.device.queue.writeBuffer(this.activeBuf, 0, active);
    const enc = encoder ?? this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.dispatchWorkgroups(list.length);
    pass.end();
    if (!encoder) this.device.queue.submit([enc.finish()]);
    for (const r of list) {
      r.sys.dispatched = true;
      r.sys.step += r.steps;
      r.sys.runner?.advance(r.steps);
    }
  }

  /** Start an async readback of all box records; updates sys.stats when done. */
  requestStats(): void {
    const k = this.statsBusy.indexOf(false);
    if (k < 0) return;
    const L = this.layout;
    const staging = this.statsStaging[k];
    this.statsBusy[k] = true;
    this.statsSlotsAtCopy[k] = this.slots.map((s) => (s?.dispatched ? s : null));
    const steps = this.slots.map((s) => s?.step ?? 0);
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.boxBuf, 0, staging, 0, L.MAX_SLOTS * L.BOXW * 4);
    this.device.queue.submit([enc.finish()]);
    staging
      .mapAsync(GPUMapMode.READ)
      .then(() => {
        const words = staging.getMappedRange().slice(0);
        staging.unmap();
        const f = new Float32Array(words);
        const u = new Uint32Array(words);
        this.statsSlotsAtCopy[k].forEach((sys, slot) => {
          if (!sys || sys.disposed || this.slots[slot] !== sys) return;
          const o = slot * L.BOXW;
          const V = f[o + BOX.V];
          if (!(V > 0)) return;
          const ke = f[o + BOX.KE];
          sys.stats = {
            step: steps[slot],
            pe: f[o + BOX.U] / sys.data.nCell,
            ke,
            T: sys.data.dof > 0 ? (2 * ke) / sys.data.dof : 0,
            V,
            rho: sys.data.nCell / V,
            accept: f[o + BOX.rate],
            delta: f[o + BOX.delta],
            B: Float64Array.from(f.subarray(o + BOX.B, o + BOX.B + 4)),
            status: u[o + BOX.status],
          };
        });
      })
      .catch(() => {})
      .finally(() => (this.statsBusy[k] = false));
  }

  /** Download a system's full dynamic state (for analysis, picking, or releasing symmetry). */
  async downloadState(sys: GpuSystem): Promise<{ state: SystemState; s: Float64Array; B: Float64Array }> {
    const L = this.layout;
    const D = 2;
    const { n } = sys.data;
    const repBytes = L.NMAX * L.REPW * 4;
    const posBytes = L.NMAX * L.POSW * 4;
    const boxBytes = L.BOXW * 4;
    const staging = this.device.createBuffer({
      size: repBytes + posBytes + boxBytes,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.repsBuf, sys.slot * repBytes, staging, 0, repBytes);
    enc.copyBufferToBuffer(this.posBuf, sys.slot * posBytes, staging, repBytes, posBytes);
    enc.copyBufferToBuffer(this.boxBuf, sys.slot * boxBytes, staging, repBytes + posBytes, boxBytes);
    const step = sys.step;
    this.device.queue.submit([enc.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const f = new Float32Array(staging.getMappedRange().slice(0));
    staging.destroy();
    const u = new Float64Array(n * D);
    const v = new Float64Array(n * D);
    const s = new Float64Array(n * D);
    for (let i = 0; i < n; i++)
      for (let a = 0; a < D; a++) {
        u[i * D + a] = f[i * L.REPW + a];
        v[i * D + a] = f[i * L.REPW + 2 + a];
        s[i * D + a] = f[repBytes / 4 + i * L.POSW + a];
      }
    const bo = (repBytes + posBytes) / 4;
    const r = sys.data.group.latticeParams.r;
    const p = Float64Array.from(f.subarray(bo + BOX.p, bo + BOX.p + r));
    const B = Float64Array.from(f.subarray(bo + BOX.B, bo + BOX.B + 4));
    return { state: { u, v, p, step }, s, B };
  }

  systems(): GpuSystem[] {
    return this.slots.filter((s): s is GpuSystem => !!s);
  }
}
