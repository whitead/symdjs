// Group library: the 17 plane groups (2D). 3D tables are available in
// data/symd/3dgroups.json and load through the same builder.

import raw2d from "../../../data/symd/2dgroups.json";
import { buildGroup, names2d, type Group, type RawGroup } from "./group";

let cache2d: Group[] | null = null;

export function planeGroups(): Group[] {
  if (!cache2d) {
    const table = raw2d as unknown as Record<string, RawGroup>;
    cache2d = names2d.map((name, i) => buildGroup(table[String(i + 1)], i + 1, 2, name));
  }
  return cache2d;
}

export function planeGroup(nameOrNumber: string | number): Group {
  const gs = planeGroups();
  const g =
    typeof nameOrNumber === "number" ? gs[nameOrNumber - 1] : gs.find((x) => x.name === nameOrNumber);
  if (!g) throw new Error(`unknown plane group ${nameOrNumber}`);
  return g;
}
