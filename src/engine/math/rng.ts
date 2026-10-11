// Counter-based random numbers. The same PCG hash is implemented in WGSL
// (see gpu/wgsl) so CPU and GPU engines draw identical noise streams.

/** PCG-RXS-M-XS 32-bit hash (Jarzynski & Olano 2020). */
export function pcg(v: number): number {
  const state = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
  const word = Math.imul(((state >>> ((state >>> 28) + 4)) ^ state) >>> 0, 277803737) >>> 0;
  return ((word >>> 22) ^ word) >>> 0;
}

export function hash4(a: number, b: number, c: number, d: number): number {
  return pcg((a ^ pcg((b ^ pcg((c ^ pcg(d >>> 0)) >>> 0)) >>> 0)) >>> 0);
}

const INV24 = 1 / 16777216;

/** Uniform in [0, 1) with 24 bits (exactly representable in f32). */
export function uniform4(a: number, b: number, c: number, d: number): number {
  return (hash4(a, b, c, d) >>> 8) * INV24;
}

/**
 * Standard normal for (seed, step, particle, component). Components 2k and
 * 2k+1 share one Box–Muller pair.
 */
export function gaussian(seed: number, step: number, particle: number, component: number): number {
  const pair = component >>> 1;
  const h1 = hash4(seed, step, particle, pair * 2);
  const h2 = hash4(seed, step, particle, pair * 2 + 1);
  const u1 = ((h1 >>> 8) + 1) * INV24; // (0, 1]
  const u2 = (h2 >>> 8) * INV24;
  const r = Math.sqrt(-2 * Math.log(u1));
  const th = 2 * Math.PI * u2;
  return component & 1 ? r * Math.sin(th) : r * Math.cos(th);
}

/** Small sequential PRNG for set-up work (initial positions, choices). */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  next(): number {
    // mulberry32
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  normal(): number {
    const u1 = 1 - this.next();
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  pick<T>(xs: readonly T[]): T {
    return xs[this.int(xs.length)];
  }
}
