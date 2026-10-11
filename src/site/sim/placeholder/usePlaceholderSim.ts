// ============================================================================
// PLACEHOLDER DRIVER: the only thing SimSlot calls. When the WebGPU engine
// lands, replace this hook with one of the same signature (canvas, size,
// options, mode) that drives the real view; SimSlot itself stays as is.
// ============================================================================

import { useEffect, useRef, type RefObject } from "react";
import type { CanvasSize } from "../../hooks/useCanvasSize";
import { occupancyKey, type Occupancy } from "../../lib/groups";
import type { Group } from "../../../engine/groups/group";
import type { ExplainerStage, SimApi, SimDisplay, SimParams, SimStats, SimVariant } from "../types";
import { DEFAULT_STYLE, centredOrigin, drawToy, pxToFrac, type HitBuffer, type ToyStyle, type ToyView } from "./drawToy";
import {
  createToyScene,
  dragRep,
  fastForward,
  releaseToy,
  stepToy,
  toyStats,
  type ToyControls,
  type ToyScene,
} from "./toySim";

/** live: animate; paused: hold the current frame; static: jump to the grown crystal and hold */
export type SimMode = "live" | "paused" | "static";

export interface SimDriverOptions {
  variant: SimVariant;
  group: string;
  occupancy: Occupancy;
  seed: number;
  params: SimParams;
  stage?: ExplainerStage;
  interactive: boolean;
  reducedMotion: boolean;
  onStats?: (s: SimStats) => void;
  /** a group object (e.g. a custom group); overrides `group` for the engine */
  groupObj?: Group;
  /** view overrides (colour mode, overlays) and CSS px per σ */
  display?: SimDisplay;
  /** receives an API for the live system (null when it goes away) */
  onApi?: (api: SimApi | null) => void;
}

interface VariantConfig {
  /** CSS px per σ */
  scale: number;
  /** CSS px per σ below 640 px wide */
  compactScale: number;
  duration: number;
  substeps: number;
  style: ToyStyle;
}

const VARIANTS: Record<SimVariant, VariantConfig> = {
  hero: { scale: 25, compactScale: 17, duration: 1800, substeps: 3, style: { ...DEFAULT_STYLE, grid: 0.055 } },
  card: { scale: 14.5, compactScale: 10, duration: 1500, substeps: 3, style: { ...DEFAULT_STYLE, grid: 0.075 } },
  plate: {
    scale: 16,
    compactScale: 13,
    duration: 1600,
    substeps: 3,
    style: { ...DEFAULT_STYLE, grid: 0.08, homeCell: true, asym: true },
  },
  explainer: { scale: 15, compactScale: 12, duration: 1200, substeps: 2, style: DEFAULT_STYLE },
};

interface StageLook {
  style: ToyStyle;
  /** cells across the view (0 = fit the home cell to 64% of the view) */
  cells: number;
  breathe: boolean;
}

function explainerStyle(stage: ExplainerStage): StageLook {
  const base = { ...DEFAULT_STYLE, homeCell: true, grid: 0.1 };
  switch (stage) {
    case "asym":
      // ghosts as faint silhouettes: most of the cell is redundant
      return { style: { ...base, scope: "cell", asym: true, ghostAlpha: 0.1, repRings: true }, cells: 0, breathe: false };
    case "ghosts":
      return { style: { ...base, scope: "cell", asym: true, ghostAlpha: 0.5, repRings: true }, cells: 0, breathe: false };
    case "tiling":
      return { style: { ...base, scope: "all", tileAlpha: 0.5, grid: 0.16 }, cells: 3.4, breathe: false };
    case "lattice":
      return { style: { ...base, scope: "all", grid: 0.55, gridOver: true }, cells: 3.2, breathe: true };
    case "wyckoff":
      return {
        style: { ...base, scope: "all", siteLines: true, emphasizeSites: true, repRings: true },
        cells: 3,
        breathe: false,
      };
    case "release":
      return { style: { ...base, scope: "all", homeCell: false, grid: 0.06 }, cells: 4.2, breathe: false };
  }
}

export function usePlaceholderSim(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  size: CanvasSize | null,
  opts: SimDriverOptions,
  mode: SimMode,
) {
  const sceneRef = useRef<ToyScene | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const viewRef = useRef<{ view: ToyView | null; scale: number }>({ view: null, scale: 0 });
  const hitsRef = useRef<HitBuffer>({ data: new Float64Array(1024), count: 0 });
  const dragRef = useRef<{ rep: number; op: number; nx: number; ny: number } | null>(null);
  const renderRef = useRef<() => void>(() => {});

  const { variant, group, seed, params, stage } = opts;
  const occKey = occupancyKey(opts.occupancy);
  const released = params.released || stage === "release";

  const controls = (): ToyControls => ({
    temperature: optsRef.current.params.temperature,
    pressure: optsRef.current.params.pressure,
    potential: optsRef.current.params.potential,
    breathe: optsRef.current.stage !== undefined && explainerStyle(optsRef.current.stage).breathe,
  });

  // (re)create the scene
  useEffect(() => {
    const o = optsRef.current;
    const sc = createToyScene(group, o.occupancy, seed, VARIANTS[variant].duration);
    // the explainer starts from a grown crystal; the rest grow live
    if (variant === "explainer" || modeRef.current === "static") fastForward(sc, controls());
    sceneRef.current = sc;
    renderRef.current();
    optsRef.current.onStats?.(toyStats(sc));
  }, [group, occKey, seed, variant, params.regrow]);

  // release / restore symmetry
  useEffect(() => {
    const sc = sceneRef.current;
    if (!sc) return;
    if (released && !sc.released) releaseToy(sc);
    else if (!released && sc.released) {
      const fresh = createToyScene(sc.group.name, optsRef.current.occupancy, sc.seed, VARIANTS[variant].duration);
      fastForward(fresh, controls());
      sceneRef.current = fresh;
    }
    renderRef.current();
    if (sceneRef.current) optsRef.current.onStats?.(toyStats(sceneRef.current));
  }, [released, variant]);

  // render + animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cfg = VARIANTS[variant];

    const layout = (snap: boolean): ToyView | null => {
      const sc = sceneRef.current;
      if (!sc) return null;
      const o = optsRef.current;
      const compact = size.width < 640;
      let target = (compact ? cfg.compactScale : cfg.scale) * size.dpr;
      if (o.stage) {
        const { B0 } = sc;
        const xs = [0, B0[0], B0[1], B0[0] + B0[1]];
        const ys = [0, B0[2], B0[3], B0[2] + B0[3]];
        const w = Math.max(...xs) - Math.min(...xs);
        const h = Math.max(...ys) - Math.min(...ys);
        const cells = explainerStyle(o.stage).cells;
        const fit = Math.min(size.pixelWidth / w, size.pixelHeight / h);
        target = cells === 0 ? 0.64 * fit : fit / cells;
      }
      const vr = viewRef.current;
      vr.scale = snap || !vr.scale || o.reducedMotion ? target : vr.scale + (target - vr.scale) * 0.09;
      const [ox, oy] = centredOrigin(sc, vr.scale, size.pixelWidth / 2, size.pixelHeight / 2);
      vr.view = { scale: vr.scale, ox, oy, width: size.pixelWidth, height: size.pixelHeight, dpr: size.dpr };
      return vr.view;
    };

    const styleFor = (): ToyStyle => {
      const o = optsRef.current;
      return o.stage ? explainerStyle(o.stage).style : cfg.style;
    };

    const render = (snap = false) => {
      const sc = sceneRef.current;
      const view = layout(snap);
      if (!sc || !view) return;
      drawToy(ctx, sc, view, styleFor(), optsRef.current.interactive ? hitsRef.current : undefined);
    };
    renderRef.current = () => render(true);

    const emit = () => {
      const sc = sceneRef.current;
      if (sc && optsRef.current.onStats) optsRef.current.onStats(toyStats(sc));
    };

    if (mode !== "live") {
      const sc = sceneRef.current;
      if (sc && mode === "static") fastForward(sc, controls());
      render(true);
      emit();
      return;
    }

    let raf = 0;
    let lastEmit = 0;
    const frame = (now: number) => {
      const sc = sceneRef.current;
      if (sc) stepToy(sc, controls(), cfg.substeps);
      render();
      if (now - lastEmit > 250) {
        lastEmit = now;
        emit();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef, size, mode, variant]);

  // redraw held frames when the explainer stage changes
  useEffect(() => {
    if (mode !== "live") renderRef.current();
  }, [stage, mode]);

  // drag a particle: all of its symmetric images follow
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !opts.interactive || !size) return;

    const toDevice = (e: PointerEvent): [number, number] => {
      const r = canvas.getBoundingClientRect();
      return [((e.clientX - r.left) * canvas.width) / r.width, ((e.clientY - r.top) * canvas.height) / r.height];
    };
    const pick = (x: number, y: number): number => {
      const view = viewRef.current.view;
      if (!view) return -1;
      const h = hitsRef.current;
      const rr = ((VARIANTS[variant].style.disc * view.scale) / 2) * 1.35;
      let best = -1;
      let bestD = rr * rr;
      for (let k = 0; k < h.count; k++) {
        const dx = h.data[k * 6] - x;
        const dy = h.data[k * 6 + 1] - y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      return best;
    };
    const down = (e: PointerEvent) => {
      const sc = sceneRef.current;
      if (!sc) return;
      const [x, y] = toDevice(e);
      const k = pick(x, y);
      if (k < 0) return;
      const d = hitsRef.current.data;
      const rep = d[k * 6 + 2];
      if (sc.reps[rep]?.site.k === 0 && !sc.reps[rep].site.general) return; // points cannot move
      dragRef.current = { rep, op: d[k * 6 + 3], nx: d[k * 6 + 4], ny: d[k * 6 + 5] };
      sc.reps[rep].pinned = true;
      canvas.setPointerCapture(e.pointerId);
      canvas.dataset.dragging = "true";
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      const sc = sceneRef.current;
      const view = viewRef.current.view;
      if (!sc || !view) return;
      const [x, y] = toDevice(e);
      const drag = dragRef.current;
      if (!drag) {
        canvas.dataset.hover = pick(x, y) >= 0 ? "true" : "false";
        return;
      }
      const [fx, fy] = pxToFrac(sc, view, x, y);
      dragRep(sc, drag.rep, drag.op, drag.nx, drag.ny, fx, fy);
      if (mode !== "live") renderRef.current();
    };
    const up = (e: PointerEvent) => {
      const sc = sceneRef.current;
      const drag = dragRef.current;
      if (sc && drag && sc.reps[drag.rep]) sc.reps[drag.rep].pinned = false;
      dragRef.current = null;
      delete canvas.dataset.dragging;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
  }, [canvasRef, opts.interactive, size, mode, variant]);
}
