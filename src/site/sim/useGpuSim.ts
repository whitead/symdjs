// The WebGPU driver behind SimSlot (same signature as the Canvas2D
// placeholder). It owns one symmetric system per slot, grows a crystal with
// the protocol, hands control to the user's sliders, releases/restores the
// symmetry, styles the explainer stages, and reports throttled stats.

import { useEffect, useRef, type RefObject } from "react";
import { growProtocol } from "../../engine/core/protocol";
import type { GpuSystem } from "../../engine/gpu/engine";
import { planeGroup } from "../../engine/groups/library";
import type { SimView, ViewOptions } from "../../engine/render/renderer";
import type { HubView, SimHub } from "../../sim/hub";
import { attachDrag, releaseSymmetry } from "../../sim/interact";
import type { CanvasSize } from "../hooks/useCanvasSize";
import { useGpuSupport } from "../hooks/useGpuSupport";
import { occupancyKey } from "../lib/groups";
import type { SimDriverOptions, SimMode } from "./placeholder/usePlaceholderSim";
import type { ExplainerStage, SimPhase, SimVariant } from "./types";
import { POTENTIALS } from "./potentials";
import { getHub } from "./useSim";

interface VariantConfig {
  /** CSS px per σ (wide / compact screens) */
  scale: number;
  compactScale: number;
  steps: number;
  view: Partial<ViewOptions>;
}

const VARIANTS: Record<SimVariant, VariantConfig> = {
  hero: { scale: 27, compactScale: 18, steps: 120, view: { colorMode: "op", showCell: false, showGrid: false } },
  card: { scale: 20, compactScale: 15, steps: 120, view: { colorMode: "rep", showCell: true, showGrid: true, gridAlpha: 0.07 } },
  plate: {
    scale: 27,
    compactScale: 19,
    steps: 120,
    view: { colorMode: "rep", showCell: true, showGrid: true, gridAlpha: 0.08, showAsym: true, markReps: true },
  },
  explainer: { scale: 15, compactScale: 12, steps: 60, view: { colorMode: "op" } },
};

interface StageLook {
  view: Partial<ViewOptions>;
  /** cells across the view (0 = home cell fills 64% of the view) */
  cells: number;
}

const BASE_STAGE: Partial<ViewOptions> = {
  homeOnly: false,
  ghostAlpha: 1,
  tileAlpha: 1,
  generalAlpha: 1,
  markReps: false,
  showAsym: false,
  showCell: true,
  showGrid: true,
  gridAlpha: 0.1,
  colorMode: "op",
};

function stageLook(stage: ExplainerStage): StageLook {
  switch (stage) {
    case "asym":
      return { view: { ...BASE_STAGE, homeOnly: true, ghostAlpha: 0.1, markReps: true, showAsym: true }, cells: 0 };
    case "ghosts":
      return { view: { ...BASE_STAGE, homeOnly: true, ghostAlpha: 0.9, markReps: true, showAsym: true }, cells: 0 };
    case "tiling":
      return { view: { ...BASE_STAGE, tileAlpha: 0.45, gridAlpha: 0.16 }, cells: 3.4 };
    case "lattice":
      return { view: { ...BASE_STAGE, colorMode: "rep", gridAlpha: 0.5 }, cells: 3.2 };
    case "wyckoff":
      return { view: { ...BASE_STAGE, colorMode: "site", generalAlpha: 0.22, markReps: true, showAsym: true }, cells: 3 };
    case "release":
      return { view: { ...BASE_STAGE, colorMode: "rep", showCell: false, gridAlpha: 0.06 }, cells: 4.2 };
  }
}

const FAST_STEPS = 1500;

function phaseOf(sys: GpuSystem, released: boolean): SimPhase {
  if (released) return "released";
  const name = sys.runner?.current.name;
  if (!name || name === "crystal") return "crystal";
  return name === "annealing" ? "annealing" : "compressing";
}

export function useGpuSim(canvasRef: RefObject<HTMLCanvasElement | null>, size: CanvasSize | null, opts: SimDriverOptions, mode: SimMode) {
  const { supported, markUnsupported } = useGpuSupport();
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const hubRef = useRef<SimHub | null>(null);
  const hvRef = useRef<HubView | null>(null);
  const symRef = useRef<GpuSystem | null>(null);
  const relRef = useRef<GpuSystem | null>(null);
  /** parameters the system was created with; a change means the user took control */
  const baseParams = useRef(opts.params);
  const manualRef = useRef(false);
  const fastRef = useRef(false);
  const camRef = useRef<{ scale: number; cx: number; cy: number } | null>(null);

  const { variant, group, seed, params, stage } = opts;
  const occKey = occupancyKey(opts.occupancy);
  const released = params.released || stage === "release";
  const hasCanvas = !!size;

  // ---- create the system and view ----
  useEffect(() => {
    if (!supported || !hasCanvas) return;
    let cancelled = false;
    let cleanupDrag: (() => void) | null = null;
    getHub()
      .then((hub) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        hubRef.current = hub;
        const o = optsRef.current;
        const sys = hub.engine.add({
          group: planeGroup(o.group),
          occupancy: o.occupancy,
          density: 0.35,
          seed: o.seed,
          params: { potential: POTENTIALS[o.params.potential] },
        });
        sys.setProtocol(growProtocol());
        symRef.current = sys;
        baseParams.current = o.params;
        manualRef.current = false;
        camRef.current = null;
        const cfg = VARIANTS[o.variant];
        const view: Partial<ViewOptions> = {
          ...cfg.view,
          ...(o.stage ? stageLook(o.stage).view : {}),
          manageSize: false,
          centerCell: false,
        };
        const hv = hub.attach(canvas, sys, view, cfg.steps);
        hvRef.current = hv;
        hv.view.onBeforeRender = (v) => frame(v, hv);
        // the explainer (and reduced motion) start from a grown crystal
        fastRef.current = o.variant === "explainer" || modeRef.current === "static";
        if (fastRef.current) canvas.style.opacity = "0";
        if (o.interactive) cleanupDrag = attachDrag(hub.engine, hv.view);
      })
      .catch((e) => markUnsupported(String(e?.message ?? e)));
    return () => {
      cancelled = true;
      cleanupDrag?.();
      const hub = hubRef.current;
      const hv = hvRef.current;
      hvRef.current = null;
      if (hub && hv) hub.detach(hv);
      symRef.current?.dispose();
      relRef.current?.dispose();
      symRef.current = null;
      relRef.current = null;
      const canvas = canvasRef.current;
      if (canvas) canvas.style.opacity = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, hasCanvas, group, occKey, seed, variant, params.regrow]);

  /** per-frame: fast-forward, camera, explainer breathing */
  function frame(v: SimView, hv: HubView) {
    const o = optsRef.current;
    const sys = v.sys;
    const cfg = VARIANTS[o.variant];
    // fast-forward growth while hidden
    if (fastRef.current) {
      const r = sys.runner;
      if (r && r.stage < r.protocol.stages.length - 1) hv.steps = FAST_STEPS;
      else {
        fastRef.current = false;
        hv.steps = cfg.steps;
        v.canvas.style.transition = "opacity 600ms ease";
        v.canvas.style.opacity = "1";
      }
    }
    hv.paused = !fastRef.current && modeRef.current !== "live";

    // camera: centre on the home cell, scale per variant or explainer stage;
    // a released supercell keeps the framing of the original cell
    const symB = sys === relRef.current ? symRef.current?.stats?.B : null;
    const B = symB ?? v.B;
    const cssW = v.canvas.clientWidth || 1;
    const cssH = v.canvas.clientHeight || 1;
    let target = cssW < 640 ? cfg.compactScale : cfg.scale;
    if (o.stage) {
      const xs = [0, B[0], B[1], B[0] + B[1]];
      const ys = [0, B[2], B[3], B[2] + B[3]];
      const w = Math.max(...xs) - Math.min(...xs);
      const h = Math.max(...ys) - Math.min(...ys);
      const fit = Math.min(cssW / w, cssH / h);
      const cells = stageLook(o.stage).cells;
      target = Math.min(64, cells === 0 ? 0.55 * fit : fit / cells);
    }
    const cx = 0.5 * (B[0] + B[1]);
    const cy = 0.5 * (B[2] + B[3]);
    const cam = camRef.current;
    const k = o.reducedMotion || !cam || fastRef.current ? 1 : 0.09;
    const next = cam
      ? { scale: cam.scale + (target - cam.scale) * k, cx: cam.cx + (cx - cam.cx) * k, cy: cam.cy + (cy - cam.cy) * k }
      : { scale: target, cx, cy };
    camRef.current = next;
    v.opts.cssPxPerSigma = next.scale;
    v.opts.center = [next.cx, next.cy];

    // explainer "lattice" step: breathe the pressure so the box visibly works
    if (o.stage === "lattice" && !fastRef.current && sys === symRef.current) {
      const phi = sys.data.nCell / Math.max(1, sys.data.n);
      if (sys.runner) sys.setProtocol(null);
      const t = performance.now() / 1000;
      sys.setParams({ T: 0.08 * phi, P: 1.2 + 0.9 * Math.sin(1.3 * t), gamma: 1, nptEvery: 1, potential: POTENTIALS.lj, forceCap: Infinity });
    }
  }

  // ---- explainer stage styling ----
  useEffect(() => {
    const hv = hvRef.current;
    if (!hv || !stage) return;
    hv.view.setOptions(stageLook(stage).view);
    const sys = symRef.current;
    if (sys && stage !== "lattice" && !sys.runner && !manualRef.current) {
      // leaving the breathing step: settle back at a steady low pressure
      const phi = sys.data.nCell / Math.max(1, sys.data.n);
      sys.setParams({ T: 0.06 * phi, P: 1, nptEvery: 4 });
    }
  }, [stage]);

  // ---- user controls take over from the protocol ----
  useEffect(() => {
    const b = baseParams.current;
    if (b.temperature === params.temperature && b.pressure === params.pressure && b.potential === params.potential) return;
    manualRef.current = true;
    const sys = relRef.current ?? symRef.current;
    if (!sys) return;
    const phi = relRef.current ? 1 : sys.data.nCell / Math.max(1, sys.data.n);
    if (sys.runner) {
      sys.setParams(sys.runner.params(1));
      sys.setProtocol(null);
    }
    sys.setParams({
      T: params.temperature * phi,
      P: relRef.current ? null : params.pressure,
      potential: POTENTIALS[params.potential],
      gamma: 1,
      forceCap: Infinity,
      nptEvery: 2,
    });
  }, [params.temperature, params.pressure, params.potential]);

  // ---- release / restore the symmetry ----
  useEffect(() => {
    const hub = hubRef.current;
    const hv = hvRef.current;
    const sym = symRef.current;
    if (!hub || !hv || !sym) return;
    let cancelled = false;
    if (released && !relRef.current) {
      releaseSymmetry(hub.engine, sym, { gamma: 0.5 }).then((rel) => {
        if (cancelled || !hvRef.current) {
          rel.dispose();
          return;
        }
        if (manualRef.current) rel.setParams({ T: optsRef.current.params.temperature, potential: POTENTIALS[optsRef.current.params.potential] });
        relRef.current = rel;
        hv.view.setSystem(rel);
        camRef.current = null;
      });
    } else if (!released && relRef.current) {
      const rel = relRef.current;
      relRef.current = null;
      hv.view.setSystem(sym);
      camRef.current = null;
      rel.dispose();
    }
    return () => {
      cancelled = true;
    };
  }, [released, hasCanvas]);

  // ---- throttled stats ----
  useEffect(() => {
    const id = setInterval(() => {
      const o = optsRef.current;
      const hv = hvRef.current;
      if (!o.onStats || !hv) return;
      const sys = hv.view.sys;
      const st = sys.stats;
      if (!st) return;
      const isRel = sys === relRef.current;
      const phi = isRel ? 1 : sys.data.nCell / Math.max(1, sys.data.n);
      o.onStats({
        phase: phaseOf(sys, isRel),
        progress: isRel ? 1 : (sys.runner?.progress ?? 1),
        nCell: sys.data.nCell,
        density: st.rho,
        energy: st.pe,
        temperature: st.T / phi,
        pressure: sys.params.P ?? 0,
      });
    }, 250);
    return () => clearInterval(id);
  }, []);
}
