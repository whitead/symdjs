import { planeGroups } from "../src/engine/groups/library";
for (const g of planeGroups()) {
  console.log(`${g.number} ${g.name} (${g.orbifold}) ${g.lattice} |G|=${g.order} r=${g.latticeParams.r}`);
  for (const s of g.sites)
    console.log(`   ${s.label.padEnd(4)} k=${s.k} repr=${s.repr.padEnd(14)} t=${Array.from(s.t).map(v=>v.toFixed(3))} L=${Array.from(s.L)} u∈${JSON.stringify(s.uRange.map(r=>r.map(v=>+v.toFixed(3))))} cosets=${s.cosetOps}`);
}
