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
  /** symmetry released: every ghost becomes a free particle */
  released?: boolean;
  /** barostat pressure P (null = fixed volume); live hero/tile systems only */
  pressure?: number | null;
  interactive: boolean;
  reducedMotion: boolean;
  /** shown full screen (the camera zooms in a little) */
  maximized?: boolean;
}
