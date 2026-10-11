// Random (group, Wyckoff occupancy) configurations for the cabinet.

import { Rng } from "../engine/math/rng";
import type { Group } from "../engine/groups/group";
import { planeGroups } from "../engine/groups/library";

export interface Config {
  group: Group;
  occupancy: Record<string, number>;
  seed: number;
}

export function nCellOf(group: Group, occ: Record<string, number>): number {
  return group.sites.reduce((a, s) => a + (occ[s.letter] ?? 0) * s.multiplicity, 0);
}

/** A random occupancy with roughly `target` particles per unit cell. */
export function randomOccupancy(group: Group, rng: Rng, target: number): Record<string, number> {
  const occ: Record<string, number> = {};
  for (const s of group.sites) {
    if (s.general) continue;
    if (rng.next() < 0.4) occ[s.letter] = s.k === 0 ? 1 : 1 + (rng.next() < 0.3 ? 1 : 0);
  }
  const general = group.sites[group.sites.length - 1];
  const rest = Math.max(0, target - nCellOf(group, occ));
  occ[general.letter] = Math.max(Object.keys(occ).length ? 0 : 1, Math.round(rest / general.multiplicity));
  while (nCellOf(group, occ) < 6) occ[general.letter]++;
  for (const k of Object.keys(occ)) if (!occ[k]) delete occ[k];
  return occ;
}

export function randomConfigs(count: number, seed = (Math.random() * 2 ** 31) | 0): Config[] {
  const rng = new Rng(seed);
  const groups = planeGroups();
  // distinct groups, shuffled
  const order = groups.map((g) => g).sort(() => rng.next() - 0.5);
  return Array.from({ length: count }, (_, i) => {
    const group = order[i % order.length];
    const target = 12 + Math.floor(rng.next() * 48);
    return { group, occupancy: randomOccupancy(group, rng, target), seed: (seed + 7919 * (i + 1)) >>> 0 };
  });
}
