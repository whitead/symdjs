// The simulation hub: one GPU device, one frame loop. Every frame it steps
// all systems that have a visible view (in a single dispatch) and renders
// every visible view.

import { GpuEngine, type GpuSystem } from "../engine/gpu/engine";
import { Renderer, SimView, type ViewOptions } from "../engine/render/renderer";

export interface HubView {
  view: SimView;
  /** steps per frame for its system */
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
    const tick = () => {
      if (!this.running) return;
      this.tick();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private tick() {
    if (this.engine.lost) return;
    this.frame++;
    const visible = [...this.views].filter((v) => v.view.visible && !v.view.sys.disposed);
    if (!visible.length) return;
    const steps = new Map<GpuSystem, number>();
    for (const v of visible) if (!v.paused) steps.set(v.view.sys, Math.max(steps.get(v.view.sys) ?? 0, v.steps));
    const encoder = this.engine.device.createCommandEncoder();
    this.engine.step([...steps].map(([sys, s]) => ({ sys, steps: s })), encoder);
    for (const v of visible) v.view.render(encoder);
    this.engine.device.queue.submit([encoder.finish()]);
    if (this.frame % 4 === 0) this.engine.requestStats();
    for (const l of this.listeners) l(this.frame);
  }
}
