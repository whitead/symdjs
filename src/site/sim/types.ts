// The contract between the page and a simulation view (SimSlot → useGpuSim).

import type { Occupancy } from "../lib/groups";

export type SimVariant = "hero" | "card" | "plate" | "explainer";

/** Growth protocol phase, shown in status lines. */
export type SimPhase = "compressing" | "annealing" | "crystal" | "released";

/** The six steps of "How it works", in order. */
export type ExplainerStage = "asym" | "ghosts" | "tiling" | "lattice" | "wyckoff" | "release";

export interface SimParams {
  /** per-orbit temperature T* = T / φ */
  temperature: number;
  /** pressure P */
  pressure: number;
  /** symmetry released: every ghost becomes a free particle */
  released: boolean;
  /** bump to restart the growth protocol from a gas */
  regrow: number;
}

export interface SimStats {
  phase: SimPhase;
  /** growth protocol progress in [0, 1] */
  progress: number;
  /** particles per unit cell */
  nCell: number;
  /** number density ρ (σ⁻²) */
  density: number;
  /** potential energy per particle */
  energy: number;
  temperature: number;
  pressure: number;
}

export const DEFAULT_PARAMS: SimParams = {
  temperature: 0.2,
  pressure: 2,
  released: false,
  regrow: 0,
};

/** live: animate; paused: hold the current frame; static: grow the crystal, then hold (reduced motion) */
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
}
