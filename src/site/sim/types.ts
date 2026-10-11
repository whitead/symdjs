// The contract between the page and a simulation view. SimSlot takes these
// props today (driving the Canvas2D placeholder); the WebGPU view should
// accept the same shape so the swap is internal to SimSlot.

export type SimVariant = "hero" | "card" | "plate" | "explainer";

export type Potential = "lj" | "wca" | "soft";

/** Growth protocol phase, shown in status lines. */
export type SimPhase = "compressing" | "annealing" | "crystal" | "released";

/** The six steps of "How it works", in order. */
export type ExplainerStage = "asym" | "ghosts" | "tiling" | "lattice" | "wyckoff" | "release";

export interface SimParams {
  /** reduced temperature T* */
  temperature: number;
  /** reduced pressure P* */
  pressure: number;
  potential: Potential;
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
  potential: "lj",
  released: false,
  regrow: 0,
};

/** Display overrides for a view. */
export interface SimDisplay {
  colorMode?: "rep" | "op" | "site" | "ink";
  showAsym?: boolean;
  showGrid?: boolean;
  showCell?: boolean;
  markReps?: boolean;
  /** CSS pixels per σ */
  scale?: number;
}

/** A snapshot of the unit cell for export. */
export interface CellExport {
  group: string;
  lattice: string;
  /** lattice vectors as columns, row-major 2×2 */
  B: number[];
  /** fractional coordinates of every particle in the cell */
  fractional: number[][];
  cartesian: number[][];
  /** rep index and op index that generated each particle */
  rep: number[];
  op: number[];
  released: boolean;
}

export interface SimApi {
  exportCell: () => Promise<CellExport>;
}
