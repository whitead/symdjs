// The WebGPU driver behind SimSlot. Each slot owns one symmetric system:
// the hero and the atlas tiles run live constant-volume Lennard-Jones
// dynamics (real motion at a moderate temperature); the explainer grows a
// crystal and restyles it per step. A system that ever goes non-finite is
// restarted from a fresh random state.

import { useEffect, useRef, useState, type RefObject } from "react";
import { growProtocol, liveProtocol, type Protocol } from "../../engine/core/protocol";
import type { PotentialSpec } from "../../engine/core/potentials";
import { initialState } from "../../engine/core/system";
import type { GpuSystem } from "../../engine/gpu/engine";
import { planeGroup } from "../../engine/groups/library";
import { HAND_PALETTE, KIND_PALETTE, type SimView, type ViewOptions } from "../../engine/render/renderer";
import type { HubView, SimHub } from "../../sim/hub";
import { attachProbe, releaseSymmetry } from "../../sim/interact";
import type { CanvasSize } from "../hooks/useCanvasSize";
import { useGpuSupport } from "../hooks/useGpuSupport";
import { occupancyKey } from "../lib/groups";
import type { ExplainerStage, SimDriverOptions, SimMode, SimVariant } from "./types";
import { getHub } from "./useSim";

const LJ: PotentialSpec = { kind: "lj", epsilon: 1, sigma: 1, rc: 3 };

/** live dynamics: per-orbit temperature, friction, number density */
const LIVE = { Tstar: 0.28, gamma: 0.2, density: 0.25 };

/** colour by site kind (general / line / point), or by handedness of the op */
const KIND: Partial<ViewOptions> = { colorMode: "kind", palette: KIND_PALETTE };
const HAND: Partial<ViewOptions> = { colorMode: "hand", palette: HAND_PALETTE };

interface VariantConfig {
  /** CSS px per σ (wide / compact screens) */
  scale: number;
  compactScale: number;
  /** steps per frame once running */
  steps: number;
  /** steps per frame while the protocol is still settling/growing */
  growSteps: number;
  view: Partial<ViewOptions>;
}

const VARIANTS: Record<SimVariant, VariantConfig> = {
  hero: { scale: 24, compactScale: 16, steps: 20, growSteps: 300, view: { ...KIND, showCell: false, showGrid: false } },
  tile: { scale: 12, compactScale: 11, steps: 20, growSteps: 300, view: { ...KIND, showCell: true, showGrid: true, gridAlpha: 0.06 } },
  explainer: { scale: 15, compactScale: 12, steps: 40, growSteps: 60, view: { ...HAND } },
};

interface StageLook {
  view: Partial<ViewOptions>;
  /** cells across the view (0 = home cell fills 55% of the view) */
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
  ...HAND,
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
      return { view: { ...BASE_STAGE, ...KIND, gridAlpha: 0.5 }, cells: 3.2 };
    case "wyckoff":
      return { view: { ...BASE_STAGE, ...KIND, generalAlpha: 0.22, markReps: true, showAsym: true }, cells: 3 };
    case "release":
      return { view: { ...BASE_STAGE, ...KIND, showCell: false, gridAlpha: 0.06 }, cells: 4.2 };
  }
}

const FAST_STEPS = 1500;

function protocolFor(variant: SimVariant): Protocol {
  return variant === "explainer" ? growProtocol() : liveProtocol({ Tstar: LIVE.Tstar, gamma: LIVE.gamma });
}

function densityFor(variant: SimVariant): number {
  return variant === "explainer" ? 0.35 : LIVE.density;
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
  const fastRef = useRef(false);
  const camRef = useRef<{ scale: number; cx: number; cy: number } | null>(null);
  /** bumped when a system is created, so effects that need it re-run */
  const [generation, setGeneration] = useState(0);

  const { variant, group, seed, stage } = opts;
  const occKey = occupancyKey(opts.occupancy);
  const released = stage === "release";
  const hasCanvas = !!size;

  // ---- create the system and view ----
  useEffect(() => {
    if (!supported || !hasCanvas) return;
    let cancelled = false;
    let cleanupProbe: (() => void) | null = null;
    getHub().then(
      (hub) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        hubRef.current = hub;
        const o = optsRef.current;
        let sys: GpuSystem;
        try {
          sys = hub.engine.add({
            group: planeGroup(o.group),
            occupancy: o.occupancy,
            density: densityFor(o.variant),
            seed: o.seed,
            params: { potential: LJ, forceCap: 20 },
          });
        } catch (e) {
          console.warn(`symd: cannot simulate ${o.group} here:`, (e as Error).message);
          return;
        }
        sys.setProtocol(protocolFor(o.variant));
        symRef.current = sys;
        camRef.current = null;
        const cfg = VARIANTS[o.variant];
        const view: Partial<ViewOptions> = {
          ...cfg.view,
          ...(o.stage ? stageLook(o.stage).view : {}),
          manageSize: false,
          centerCell: false,
        };
        const hv = hub.attach(canvas, sys, view, cfg.growSteps);
        hvRef.current = hv;
        hv.view.onBeforeRender = (v) => frame(v, hv);
        // the explainer (and reduced motion) start from a grown crystal
        fastRef.current = o.variant === "explainer" || modeRef.current === "static";
        if (fastRef.current) canvas.style.opacity = "0";
        if (o.interactive) cleanupProbe = attachProbe(hv.view);
        setGeneration((g) => g + 1);
      },
      (e) => markUnsupported(String(e?.message ?? e)),
    );
    return () => {
      cancelled = true;
      cleanupProbe?.();
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
  }, [supported, hasCanvas, group, occKey, seed, variant]);

  /** per-frame: recovery, fast-forward, steps, camera, explainer breathing */
  function frame(v: SimView, hv: HubView) {
    const o = optsRef.current;
    const sys = v.sys;
    const cfg = VARIANTS[o.variant];

    // a diverged system (non-finite energy) restarts from a fresh state
    if (sys.stats && sys.stats.status & 1 && hubRef.current) {
      const fresh = initialState(sys.data, densityFor(o.variant), (sys.seed + 7919 * (sys.step + 1)) >>> 0, 0.1);
      hubRef.current.engine.uploadState(sys, fresh);
      sys.setProtocol(protocolFor(o.variant));
      camRef.current = null;
    }

    const growing = !!sys.runner && sys.runner.stage < sys.runner.protocol.stages.length - 1;
    if (fastRef.current) {
      if (growing) hv.steps = FAST_STEPS;
      else {
        fastRef.current = false;
        v.canvas.style.transition = "opacity 600ms ease";
        v.canvas.style.opacity = "1";
      }
    }
    if (!fastRef.current) hv.steps = growing ? cfg.growSteps : cfg.steps;
    hv.paused = !fastRef.current && modeRef.current !== "live";

    // camera: centre on the home cell; a released supercell keeps the
    // framing of the original cell
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
      sys.setParams({ T: 0.08 * phi, P: 1.2 + 0.9 * Math.sin(1.3 * t), gamma: 1, nptEvery: 1, potential: LJ, forceCap: Infinity });
    }
  }

  // ---- explainer stage styling ----
  useEffect(() => {
    const hv = hvRef.current;
    if (!hv || !stage) return;
    hv.view.setOptions(stageLook(stage).view);
    // (re-applied when the system is (re)created: see deps)
    const sys = symRef.current;
    if (sys && stage !== "lattice" && !sys.runner) {
      // leaving the breathing step: settle back at a steady low pressure
      const phi = sys.data.nCell / Math.max(1, sys.data.n);
      sys.setParams({ T: 0.06 * phi, P: 1, nptEvery: 4 });
    }
  }, [stage, generation]);

  // ---- release / restore the symmetry (explainer) ----
  useEffect(() => {
    const hub = hubRef.current;
    const hv = hvRef.current;
    const sym = symRef.current;
    if (!hub || !hv || !sym) return;
    let cancelled = false;
    if (released && !relRef.current) {
      releaseSymmetry(hub.engine, sym, { gamma: 0.5 }).then(
        (rel) => {
          if (cancelled || symRef.current !== sym || hvRef.current !== hv || relRef.current) {
            rel.dispose();
            return;
          }
          relRef.current = rel;
          hv.view.setSystem(rel);
          camRef.current = null;
        },
        (e) => console.warn("symd: could not release the symmetry:", (e as Error).message),
      );
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
  }, [released, generation]);
}
