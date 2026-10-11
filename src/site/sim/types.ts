// The contract between the page and a simulation view (SimSlot → useGpuSim).

import type { Occupancy } from "../lib/groups";

export type SimVariant = "hero" | "tile" | "explainer";

/** The six steps of "How it works", in order. */
export type ExplainerStage = "asym" | "ghosts" | "tiling" | "lattice" | "wyckoff" | "release";

/** live: animate; paused: hold the current frame; static: settle, then hold (reduced motion) */
export type SimMode = "live" | "paused" | "static";

export interface SimDriverOptions {
  variant: SimVariant;
  group: string;
  occupancy: Occupancy;
  seed: number;
  stage?: ExplainerStage;
  interactive: boolean;
  reducedMotion: boolean;
}
