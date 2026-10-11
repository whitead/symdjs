// Dev page: symmetry diagrams of all 17 plane groups. URL params:
// ?cells=2  &size=280  &asym=0  &wyckoff=0  &hl=a (highlight a letter everywhere)
// &groups=p4m,p6m (show only these)

import { useState, type CSSProperties } from "react";
import type { Group, WyckoffSite } from "../../engine/groups/group";
import { planeGroups } from "../../engine/groups/library";
import { SymmetryDiagram } from "../components/SymmetryDiagram";

const params = new URLSearchParams(window.location.search);
const only = params.get("groups")?.split(",");

/** "x,1/2"-style coordinates of a site's representative manifold t + L u. */
function coords(s: WyckoffSite): string {
  const frac = (v: number) => {
    for (let d = 1; d <= 12; d++) if (Math.abs(v * d - Math.round(v * d)) < 1e-9) return d === 1 ? `${Math.round(v)}` : `${Math.round(v * d)}/${d}`;
    return v.toFixed(3);
  };
  return Array.from({ length: 2 }, (_, i) => {
    if (s.general) return "xy"[i];
    // a line parameter is called y if it runs along b, else x (as in the Tables)
    const name = s.k === 1 && s.L[0] === 0 ? "y" : "x";
    let out = "";
    if (s.k === 1) {
      const a = s.L[i];
      if (a) out += `${a < 0 ? "−" : ""}${Math.abs(a) === 1 ? "" : Math.abs(a)}${name}`;
    }
    const t = s.t[i];
    if (t || !out) out += `${t < 0 ? "−" : out ? "+" : ""}${frac(Math.abs(t))}`;
    return out;
  }).join(",");
}
const SERIF ='"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';

function Plate({ group, size, cells, showAsym, showWyckoff }: { group: Group; size: number; cells: number; showAsym: boolean; showWyckoff: boolean }) {
  const [hl, setHl] = useState<string | null>(params.get("hl"));
  return (
    <figure style={{ margin: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <figcaption style={{ display: "flex", gap: 10, alignItems: "baseline", width: "100%", borderBottom: "1px solid var(--ink)", paddingBottom: 3 }}>
        <span style={{ fontVariantNumeric: "oldstyle-nums", opacity: 0.6 }}>{group.number}</span>
        <span style={{ fontStyle: "italic", fontSize: 20 }}>{group.name}</span>
        <span style={{ opacity: 0.7 }}>{group.orbifold}</span>
        <span style={{ marginLeft: "auto", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.6 }}>
          {group.lattice}
        </span>
      </figcaption>
      <SymmetryDiagram
        group={group}
        size={size}
        cells={cells}
        showAsym={showAsym}
        showWyckoff={showWyckoff}
        highlightSite={hl ?? undefined}
        onHoverSite={setHl}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", justifyContent: "center", fontSize: 13 }}>
        {group.sites.map((s) => (
          <span
            key={s.letter}
            onPointerEnter={() => setHl(s.letter)}
            onPointerLeave={() => setHl(null)}
            style={{ cursor: "default", color: hl === s.letter ? "var(--accent)" : undefined }}
            title={s.coords.join("; ")}
          >
            {s.multiplicity}
            <i>{s.letter}</i> <span style={{ opacity: 0.6 }}>({coords(s)})</span>
          </span>
        ))}
      </div>
    </figure>
  );
}

export function DiagramsDev() {
  const [cells, setCells] = useState(Number(params.get("cells") ?? 1));
  const [showAsym, setShowAsym] = useState(params.get("asym") !== "0");
  const [showWyckoff, setShowWyckoff] = useState(params.get("wyckoff") !== "0");
  const size = Number(params.get("size") ?? 300);
  return (
    <main
      style={
        {
          "--ink": "#1f2430",
          "--paper": "#f5f4e9",
          "--accent": "#f94144",
          "--asym": "#f9c74f",
          background: "var(--paper)",
          color: "var(--ink)",
          fontFamily: SERIF,
          minHeight: "100vh",
          padding: "28px 36px",
          boxSizing: "border-box",
        } as CSSProperties
      }
    >
      <header style={{ display: "flex", alignItems: "baseline", gap: 24, marginBottom: 24 }}>
        <h1 style={{ fontWeight: 400, fontSize: 28, margin: 0 }}>The seventeen plane groups</h1>
        <label>
          cells{" "}
          <select value={cells} onChange={(e) => setCells(Number(e.target.value))}>
            {[1, 2, 3].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={showAsym} onChange={(e) => setShowAsym(e.target.checked)} /> asymmetric unit
        </label>
        <label>
          <input type="checkbox" checked={showWyckoff} onChange={(e) => setShowWyckoff(e.target.checked)} /> Wyckoff sites
        </label>
      </header>
      <section style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${size + 20}px, 1fr))`, gap: "28px 32px" }}>
        {planeGroups()
          .filter((g) => !only || only.includes(g.name))
          .map((g) => (
          <Plate key={g.number} group={g} size={size} cells={cells} showAsym={showAsym} showWyckoff={showWyckoff} />
        ))}
      </section>
    </main>
  );
}
