// The simulation hub: one GPU device, one frame loop. Every frame it steps
// all systems that have a visible view (in a single dispatch) and renders
// every visible view.

import { GpuEngine, type GpuSystem } from "../engine/gpu/engine";
import { Renderer, SimView, type ViewOptions } from "../engine/render/renderer";

export interface HubView {
  view: SimView;
  /** steps per 1/60 s of real time for its system */
  steps: number;
  paused: boolean;
}

type Listener = (frame: number) => void;

export class SimHub {
  private static promise: Promise<SimHub> | null = null;
  readonly views = new Set<HubView>();
  private listeners = new Set<Listener>();
  private frame = 0;
  private running = false;
  /** global multiplier on steps per frame, shed when the GPU can't keep up */
  stepScale = 1;
  /**
   * Frames are capped at this rate, and HubView.steps is per 1/60 s of real
   * time, so the simulation runs at the same speed on 60, 120 or 144 Hz
   * displays instead of faster (and hotter) on high-refresh screens.
   */
  maxFps = 60;
  private lastFrame = 0;
  private avgDt = 1000 / 60;
  private observer: IntersectionObserver;
  private byCanvas = new Map<Element, HubView>();

  static get(): Promise<SimHub> {
    if (!SimHub.promise) SimHub.promise = GpuEngine.create().then((e) => new SimHub(e));
    return SimHub.promise;
  }

  constructor(
    readonly engine: GpuEngine,
    readonly renderer = new Renderer(engine),
  ) {
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          const hv = this.byCanvas.get(en.target);
          if (hv) hv.view.visible = en.isIntersecting;
        }
      },
      { rootMargin: "120px" },
    );
  }

  attach(canvas: HTMLCanvasElement, sys: GpuSystem, opts: Partial<ViewOptions> = {}, steps = 100): HubView {
    const view = new SimView(this.renderer, canvas, sys, opts);
    const hv: HubView = { view, steps, paused: false };
    this.views.add(hv);
    this.byCanvas.set(canvas, hv);
    this.observer.observe(canvas);
    this.start();
    return hv;
  }

  detach(hv: HubView) {
    this.views.delete(hv);
    this.byCanvas.delete(hv.view.canvas);
    this.observer.unobserve(hv.view.canvas);
    hv.view.dispose();
  }

  onFrame(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private start() {
    if (this.running) return;
    this.running = true;
    const tick = (t: number) => {
      if (!this.running) return;
      this.tick(t);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private tick(now: number) {
    if (this.engine.lost) return;
    const minDt = 1000 / this.maxFps;
    // skip display refreshes beyond the cap (a little slack for timer jitter)
    if (this.lastFrame && now - this.lastFrame < minDt - 3) return;
    const dt = this.lastFrame ? Math.min(100, now - this.lastFrame) : minDt;
    this.lastFrame = now;
    this.frame++;
    // GPU-bound frames stretch past the cap: shed simulation load
    this.avgDt += 0.1 * (dt - this.avgDt);
    if (this.avgDt > minDt * 1.15) this.stepScale = Math.max(0.1, this.stepScale * 0.95);
    else if (this.avgDt < minDt * 1.05) this.stepScale = Math.min(1, this.stepScale * 1.01);
    // steps are given per 1/60 s; scale by the real time this frame covers
    const timeScale = Math.min(2, dt / (1000 / 60));
    const visible = [...this.views].filter((v) => v.view.visible && !v.view.sys.disposed);
    if (!visible.length) return;
    const steps = new Map<GpuSystem, number>();
    for (const v of visible)
      if (!v.paused)
        steps.set(v.view.sys, Math.max(steps.get(v.view.sys) ?? 0, Math.max(1, Math.round(v.steps * this.stepScale * timeScale))));
    const encoder = this.engine.device.createCommandEncoder();
    this.engine.step([...steps].map(([sys, s]) => ({ sys, steps: s })), encoder);
    for (const v of visible) v.view.render(encoder);
    this.engine.device.queue.submit([encoder.finish()]);
    if (this.frame % 4 === 0) this.engine.requestStats();
    for (const l of this.listeners) l(this.frame);
  }
}
