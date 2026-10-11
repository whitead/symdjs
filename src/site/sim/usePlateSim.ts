// State and actions behind an atlas plate: occupancy, thermodynamic
// controls, crystal growth, melting/quenching, and releasing the symmetry.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PotentialKind, PotentialSpec } from "../../engine/core/potentials";
import type { GpuSystem } from "../../engine/gpu/engine";
import type { Group } from "../../engine/groups/group";
import { releaseSymmetry } from "../../sim/interact";
import { nCellOf } from "../../sim/random";
import { getHub, type SimConfig } from "./useSim";

export const POTENTIALS: Record<PotentialKind, PotentialSpec> = {
  lj: { kind: "lj", epsilon: 1, sigma: 1, rc: 3 },
  wca: { kind: "wca", epsilon: 1, sigma: 1, rc: 1.12 },
  soft: { kind: "soft", epsilon: 30, sigma: 1, rc: 1.1 },
};

export interface History {
  rho: number[];
  pe: number[];
  T: number[];
}

const HISTORY = 90;

export interface PlateSim {
  config: SimConfig;
  setOccupancy: (occ: Record<string, number>) => void;
  nCell: number;
  /** mean orbit size φ = N_cell / n; T* = T / φ */
  phi: number;
  sys: GpuSystem | null;
  onSystem: (sys: GpuSystem | null, replace: (s: GpuSystem) => void) => void;
  /** per-orbit temperature T* (null while a protocol is in control) */
  Tstar: number | null;
  setTstar: (t: number) => void;
  P: number | null;
  setP: (p: number | null) => void;
  potential: PotentialKind;
  setPotential: (k: PotentialKind) => void;
  regrow: () => void;
  melt: () => void;
  quench: () => void;
  released: boolean;
  toggleRelease: () => Promise<void>;
  stage: string;
  progress: number;
  history: History;
}

export function usePlateSim(group: Group, initial: Record<string, number>, seed: number): PlateSim {
  const [occupancy, setOcc] = useState(initial);
  const [nonce, setNonce] = useState(0);
  const config = useMemo<SimConfig>(() => ({ group, occupancy, seed: seed + nonce * 7919, density: 0.35 }), [group, occupancy, seed, nonce]);
  const nCell = nCellOf(group, occupancy);
  const n = Object.values(occupancy).reduce((a, b) => a + b, 0);
  const phi = nCell / Math.max(1, n);

  const sysRef = useRef<GpuSystem | null>(null);
  const symRef = useRef<GpuSystem | null>(null);
  const replaceRef = useRef<((s: GpuSystem) => void) | null>(null);
  const [sys, setSys] = useState<GpuSystem | null>(null);
  const [Tstar, setTstarState] = useState<number | null>(null);
  const [P, setPState] = useState<number | null>(1);
  const [potential, setPotentialState] = useState<PotentialKind>("lj");
  const [released, setReleased] = useState(false);
  const [stage, setStage] = useState("");
  const [progress, setProgress] = useState(0);
  const [history, setHistory] = useState<History>({ rho: [], pe: [], T: [] });

  const onSystem = useCallback((s: GpuSystem | null, replace: (s: GpuSystem) => void) => {
    sysRef.current = s;
    replaceRef.current = replace;
    setSys(s);
    if (s && s.group.name === group.name) symRef.current = s;
    setHistory({ rho: [], pe: [], T: [] });
  }, [group.name]);

  // poll stats for readouts and sparklines
  useEffect(() => {
    const id = setInterval(() => {
      const s = sysRef.current;
      if (!s) return;
      setStage(s.runner ? s.runner.current.name : released ? "unconstrained" : "manual");
      setProgress(s.runner?.progress ?? 1);
      const st = s.stats;
      if (!st) return;
      setHistory((h) => ({
        rho: [...h.rho, st.rho].slice(-HISTORY),
        pe: [...h.pe, st.pe].slice(-HISTORY),
        T: [...h.T, st.T].slice(-HISTORY),
      }));
    }, 160);
    return () => clearInterval(id);
  }, [released]);

  const manual = (patch: Parameters<GpuSystem["setParams"]>[0]) => {
    const s = sysRef.current;
    if (!s) return;
    if (s.runner) {
      // take over from the protocol, keeping its current settings
      const cur = s.runner.params(1);
      s.setProtocol(null);
      s.setParams(cur);
    }
    s.setParams(patch);
  };

  const setTstar = (t: number) => {
    setTstarState(t);
    const s = sysRef.current;
    if (!s) return;
    const ph = s.data.nCell / Math.max(1, s.data.n);
    manual({ T: t * (released ? 1 : ph), gamma: 1 });
  };
  const setP = (p: number | null) => {
    setPState(p);
    manual({ P: released ? null : p, nptEvery: 2 });
  };
  const setPotential = (k: PotentialKind) => {
    setPotentialState(k);
    manual({ potential: POTENTIALS[k], forceCap: Infinity });
  };

  const setOccupancy = (occ: Record<string, number>) => {
    setReleased(false);
    setTstarState(null);
    setOcc(occ);
  };
  const regrow = () => {
    setReleased(false);
    setTstarState(null);
    setNonce((x) => x + 1);
  };
  const melt = () => setTstar(0.9);
  const quench = () => setTstar(0.02);

  const toggleRelease = async () => {
    const hub = await getHub();
    const replace = replaceRef.current;
    const cur = sysRef.current;
    if (!replace || !cur) return;
    if (!released) {
      const rel = await releaseSymmetry(hub.engine, cur, { gamma: 0.5 });
      setReleased(true);
      setTstarState(rel.params.T);
      replace(rel);
    } else {
      setReleased(false);
      setTstarState(null);
      setNonce((x) => x + 1);
    }
  };

  return {
    config,
    setOccupancy,
    nCell,
    phi,
    sys,
    onSystem,
    Tstar,
    setTstar,
    P,
    setP,
    potential,
    setPotential,
    regrow,
    melt,
    quench,
    released,
    toggleRelease,
    stage,
    progress,
    history,
  };
}
