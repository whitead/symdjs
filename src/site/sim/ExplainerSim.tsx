// The pinned simulation for "How it works". One p4m system is restyled as
// the reader scrolls through the steps:
//   0 asymmetric unit · 1 ghosts · 2 tiling · 3 Bravais lattice under
//   pressure · 4 Wyckoff positions · 5 release the symmetry

import { useEffect, useMemo, useRef } from "react";
import { growProtocol } from "../../engine/core/protocol";
import type { GpuSystem } from "../../engine/gpu/engine";
import { planeGroup } from "../../engine/groups/library";
import type { ViewOptions } from "../../engine/render/renderer";
import { releaseSymmetry } from "../../sim/interact";
import { getHub, useSimSystem, type SimConfig } from "./useSim";

export interface ExplainerSimProps {
  step: number;
  /** progress through the current step, 0..1 */
  progress: number;
  className?: string;
}

const lerp = (a: number, b: number, x: number) => a + (b - a) * Math.min(1, Math.max(0, x));
const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));

export function ExplainerSim({ step, progress, className }: ExplainerSimProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const config: SimConfig = useMemo(() => ({ group: planeGroup("p4m"), occupancy: { g: 2, e: 1, a: 1 }, seed: 11, density: 0.42 }), []);
  const phi = 21 / 4;
  const { sys, replace } = useSimSystem(ref, config, {
    params: { T: 0.7 * phi, gamma: 2, potential: { kind: "lj", epsilon: 1, sigma: 1, rc: 3 } },
    steps: 60,
    interactive: true,
    view: { span: 7, colorMode: "op", showCell: true, showAsym: true, markReps: true, homeOnly: true, ghostAlpha: 0 },
  });
  const symRef = useRef<GpuSystem | null>(null);
  const releasedRef = useRef<GpuSystem | null>(null);
  const grownRef = useRef(false);

  // remember the symmetric system
  useEffect(() => {
    if (sys && sys.group.name === "p4m") symRef.current = sys;
  }, [sys]);

  // dynamics per step
  useEffect(() => {
    const s = symRef.current;
    if (!s) return;
    if (step >= 3 && !grownRef.current) {
      grownRef.current = true;
      s.setProtocol(growProtocol({ speed: 0.6 }));
    }
    if (step >= 5 && !releasedRef.current) {
      getHub().then(async (hub) => {
        if (releasedRef.current) return;
        const rel = await releaseSymmetry(hub.engine, s);
        releasedRef.current = rel;
        replace(rel);
      });
    }
    if (step < 5 && releasedRef.current) {
      // scrolling back: rebuild the symmetric view from the released state is
      // unnecessary; simply switch back to the symmetric system
      const rel = releasedRef.current;
      releasedRef.current = null;
      getHub().then((hub) => {
        const fresh = hub.engine.add({ group: s.group, occupancy: config.occupancy, density: config.density!, seed: config.seed + 1 });
        fresh.setProtocol(growProtocol({ speed: 0.4 }));
        symRef.current = fresh;
        replace(fresh);
        rel.dispose();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, sys]);

  // view styling per step (continuous in progress)
  const view = useMemo<Partial<ViewOptions>>(() => {
    const p = ease(progress);
    switch (step) {
      case 0:
        return { span: 7, colorMode: "op", homeOnly: true, ghostAlpha: 0, markReps: true, showAsym: true, showCell: true, showGrid: false };
      case 1:
        return { span: 7, colorMode: "op", homeOnly: true, ghostAlpha: lerp(0.05, 1, p), markReps: true, showAsym: true, showCell: true, showGrid: false };
      case 2:
        return { span: lerp(7, 26, p), colorMode: "op", homeOnly: false, ghostAlpha: 1, markReps: true, showAsym: false, showCell: true, showGrid: true };
      case 3:
        return { span: 22, colorMode: "rep", homeOnly: false, ghostAlpha: 1, markReps: true, showAsym: false, showCell: true, showGrid: true };
      case 4:
        return { span: 18, colorMode: "site", homeOnly: false, ghostAlpha: 1, markReps: true, showAsym: true, showCell: true, showGrid: false };
      default:
        return { span: 22, colorMode: "rep", homeOnly: false, ghostAlpha: 1, markReps: false, showAsym: false, showCell: true, showGrid: false };
    }
  }, [step, progress]);

  // apply view options without re-creating the system
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    let raf = 0;
    getHub().then((hub) => {
      const apply = () => {
        for (const hv of hub.views) if (hv.view.canvas === ref.current) hv.view.setOptions(viewRef.current);
      };
      apply();
      raf = requestAnimationFrame(apply);
    });
    return () => cancelAnimationFrame(raf);
  }, [view]);

  return (
    <canvas
      ref={ref}
      className={className}
      style={{ display: "block", width: "100%", height: "100%", touchAction: "none" }}
      role="img"
      aria-label="Explainer simulation in plane group p4m"
    />
  );
}
