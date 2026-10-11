// React bindings for the simulation hub.

import { useEffect, useRef, useState } from "react";
import type { Protocol } from "../../engine/core/protocol";
import type { SimParams } from "../../engine/core/system";
import type { GpuStats, GpuSystem } from "../../engine/gpu/engine";
import type { Group } from "../../engine/groups/group";
import type { ViewOptions } from "../../engine/render/renderer";
import { SimHub, type HubView } from "../../sim/hub";
import { attachDrag } from "../../sim/interact";

export type GpuStatus = "pending" | "ready" | "unsupported";

let hubStatus: GpuStatus = typeof navigator !== "undefined" && "gpu" in navigator ? "pending" : "unsupported";
const statusListeners = new Set<(s: GpuStatus) => void>();

export function getHub(): Promise<SimHub> {
  const p = SimHub.get();
  p.then(
    () => setStatus("ready"),
    () => setStatus("unsupported"),
  );
  return p;
}

function setStatus(s: GpuStatus) {
  if (hubStatus === s) return;
  hubStatus = s;
  statusListeners.forEach((l) => l(s));
}

/** WebGPU availability; resolves by actually creating the device. */
export function useGpuStatus(): GpuStatus {
  const [s, setS] = useState(hubStatus);
  useEffect(() => {
    statusListeners.add(setS);
    if (hubStatus !== "unsupported") getHub().catch(() => {});
    setS(hubStatus);
    return () => {
      statusListeners.delete(setS);
    };
  }, []);
  return s;
}

export interface SimConfig {
  group: Group;
  occupancy: Record<string, number>;
  seed: number;
  density?: number;
}

export function configKey(c: SimConfig): string {
  return `${c.group.name}|${JSON.stringify(c.occupancy)}|${c.seed}|${c.density ?? ""}`;
}

export interface UseSimOptions {
  protocol?: Protocol | null;
  params?: Partial<SimParams>;
  view?: Partial<ViewOptions>;
  steps?: number;
  interactive?: boolean;
}

/**
 * Create a GPU system for `config`, attach it to `canvasRef`, and dispose
 * both on unmount or when the configuration changes.
 */
export function useSimSystem(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  config: SimConfig | null,
  opts: UseSimOptions = {},
): { sys: GpuSystem | null; view: HubView | null; replace: (s: GpuSystem) => void } {
  const [sys, setSys] = useState<GpuSystem | null>(null);
  const hvRef = useRef<HubView | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const key = config ? configKey(config) : "";

  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    let cleanupDrag: (() => void) | null = null;
    let mine: GpuSystem | null = null;
    getHub().then((hub) => {
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      const o = optsRef.current;
      try {
        mine = hub.engine.add({
          group: config.group,
          occupancy: config.occupancy,
          density: config.density ?? 0.35,
          seed: config.seed,
          params: o.params,
        });
      } catch (e) {
        console.warn("could not create system", e);
        return;
      }
      if (o.protocol) mine.setProtocol(o.protocol);
      const hv = hub.attach(canvas, mine, o.view, o.steps ?? 120);
      hvRef.current = hv;
      if (o.interactive) cleanupDrag = attachDrag(hub.engine, hv.view);
      setSys(mine);
    });
    return () => {
      cancelled = true;
      cleanupDrag?.();
      const hv = hvRef.current;
      hvRef.current = null;
      SimHub.get().then((hub) => {
        if (hv) {
          hub.detach(hv);
          hv.view.sys.dispose();
        }
        mine?.dispose();
      });
      setSys(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // live view options
  useEffect(() => {
    if (opts.view) hvRef.current?.view.setOptions(opts.view);
  }, [JSON.stringify(opts.view ?? {})]); // eslint-disable-line react-hooks/exhaustive-deps

  const replace = (s: GpuSystem) => {
    const hv = hvRef.current;
    if (!hv) return;
    const old = hv.view.sys;
    hv.view.setSystem(s);
    if (old !== s) old.dispose();
    setSys(s);
  };
  return { sys, view: hvRef.current, replace };
}

export interface LiveStats {
  stats: GpuStats | null;
  stage: string;
  progress: number;
}

/** Poll a system's stats at a gentle rate for UI readouts. */
export function useLiveStats(sys: GpuSystem | null, hz = 6): LiveStats {
  const [s, setS] = useState<LiveStats>({ stats: null, stage: "", progress: 0 });
  useEffect(() => {
    if (!sys) return;
    const id = setInterval(() => {
      setS({ stats: sys.stats, stage: sys.runner?.current.name ?? "manual", progress: sys.runner?.progress ?? 1 });
    }, 1000 / hz);
    return () => clearInterval(id);
  }, [sys, hz]);
  return s;
}
