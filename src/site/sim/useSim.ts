// Shared access to the simulation hub (one GPU device for the whole page).

import { SimHub } from "../../sim/hub";

export function getHub(): Promise<SimHub> {
  return SimHub.get();
}
