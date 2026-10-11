// Default occupancy for each plate: low-energy crystals from a CPU survey
// (scripts/survey.ts) of random Wyckoff occupancies grown with growProtocol.

export const plateDefaults: Record<string, Record<string, number>> = {
  p1: { a: 14 },
  p2: { c: 1, d: 1, e: 5 },
  pm: { a: 2, b: 1, c: 6 },
  pg: { a: 12 },
  cm: { b: 6 },
  pmm: { d: 1, e: 1, f: 1, g: 1, h: 1, i: 9 },
  pmg: { a: 1, b: 1, d: 8 },
  pgg: { a: 1, c: 7 },
  cmm: { e: 1, f: 1 },
  p4: { c: 1, d: 7 },
  p4m: { a: 1, b: 1, d: 1, e: 2, g: 4 },
  p4g: { b: 1, c: 1, d: 3 },
  p3: { a: 1, b: 1, c: 1, d: 3 },
  p3m1: { a: 1, b: 1, e: 6 },
  p31m: { a: 1, d: 5 },
  p6: { a: 1, d: 4 },
  p6m: { b: 1, c: 1, d: 2, e: 1, f: 1 },
};
