import type { PotentialKind, PotentialSpec } from "../../engine/core/potentials";

export const POTENTIALS: Record<PotentialKind, PotentialSpec> = {
  lj: { kind: "lj", epsilon: 1, sigma: 1, rc: 3 },
  wca: { kind: "wca", epsilon: 1, sigma: 1, rc: 1.12 },
  soft: { kind: "soft", epsilon: 30, sigma: 1, rc: 1.1 },
};
