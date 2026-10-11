// Simulation protocols: a sequence of stages with ramped temperature and
// optional pressure. Temperatures are given per orbit (T* = T / φ with
// φ = N_cell / n, the mean orbit size) so one protocol works for every group:
// a symmetric crystal at true temperature T moves like an unconstrained one
// at T / φ.

import type { PotentialSpec } from "./potentials";
import type { SimParams } from "./system";

export interface Stage {
  name: string;
  steps: number;
  /** per-orbit temperature at stage start and end (linear ramp) */
  Tstar: [number, number];
  P: number | null;
  gamma: number;
  potential: PotentialSpec;
  forceCap?: number;
  nptEvery?: number;
}

export interface Protocol {
  stages: Stage[];
  /** loop the final stage forever (true) or stop */
  holdLast: boolean;
}

const LJ: PotentialSpec = { kind: "lj", epsilon: 1, sigma: 1, rc: 3 };
const SOFT: PotentialSpec = { kind: "soft", epsilon: 30, sigma: 1, rc: 1.1 };

/** Grow a crystal from a dilute random start (compress under NPT, then anneal). */
export function growProtocol(opts: { P?: number; Tmelt?: number; Tfinal?: number; speed?: number } = {}): Protocol {
  const P = opts.P ?? 1;
  const Tm = opts.Tmelt ?? 0.45;
  const Tf = opts.Tfinal ?? 0.04;
  const k = opts.speed ?? 1;
  return {
    holdLast: true,
    stages: [
      { name: "settling", steps: Math.round(400 * k), Tstar: [0.5, 0.5], P: null, gamma: 10, potential: SOFT },
      { name: "melting", steps: Math.round(800 * k), Tstar: [Tm, Tm], P: null, gamma: 2, potential: LJ, forceCap: 60 },
      { name: "compressing", steps: Math.round(12000 * k), Tstar: [Tm, 0.2], P, gamma: 1, potential: LJ, nptEvery: 2 },
      { name: "annealing", steps: Math.round(16000 * k), Tstar: [0.2, Tf], P, gamma: 1, potential: LJ, nptEvery: 2 },
      { name: "crystal", steps: 4000, Tstar: [Tf, Tf], P, gamma: 1, potential: LJ, nptEvery: 4 },
    ],
  };
}

/** Tracks progress through a protocol and produces parameters. */
export class ProtocolRunner {
  stage = 0;
  stepInStage = 0;
  constructor(
    public protocol: Protocol,
    /** mean orbit size φ = N_cell / n */
    public phi: number,
  ) {}

  get current(): Stage {
    return this.protocol.stages[this.stage];
  }

  get finished(): boolean {
    const last = this.protocol.stages.length - 1;
    return !this.protocol.holdLast && this.stage === last && this.stepInStage >= this.current.steps;
  }

  /** fraction of the whole protocol completed (holding counts as 1) */
  get progress(): number {
    const total = this.protocol.stages.slice(0, -1).reduce((a, s) => a + s.steps, 0);
    const done = this.protocol.stages.slice(0, this.stage).reduce((a, s) => a + s.steps, 0) + this.stepInStage;
    return Math.min(1, done / Math.max(1, total));
  }

  /** Parameters for the next `chunk` steps (evaluated at the chunk midpoint). */
  params(chunk = 1): Partial<SimParams> {
    const s = this.current;
    const x = Math.min(1, (this.stepInStage + chunk / 2) / Math.max(1, s.steps));
    const Tstar = s.Tstar[0] + (s.Tstar[1] - s.Tstar[0]) * x;
    return {
      T: Tstar * this.phi,
      P: s.P,
      gamma: s.gamma,
      potential: s.potential,
      forceCap: s.forceCap ?? Infinity,
      nptEvery: s.nptEvery ?? 4,
    };
  }

  /** Advance by `steps`; returns true if the stage changed. */
  advance(steps: number): boolean {
    this.stepInStage += steps;
    const last = this.protocol.stages.length - 1;
    if (this.stepInStage >= this.current.steps && this.stage < last) {
      this.stage++;
      this.stepInStage = 0;
      return true;
    }
    return false;
  }
}
