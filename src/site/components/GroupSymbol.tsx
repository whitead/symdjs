// Typeset group symbols.
//   <HM name="p4m" />         p4m with italic letters, upright digits
//   <Orbifold symbol="*442"/>  ∗442 (mathematical asterisk, × for crosscaps)
// Both inherit font-family from context: serif in plate titles, mono in
// captions and chips.

import "../styles/components/group-symbol.css";

export function HM({ name, className }: { name: string; className?: string }) {
  const parts = name.match(/[a-z]+|\d+/gi) ?? [name];
  return (
    <span className={["hm", className].filter(Boolean).join(" ")}>
      {parts.map((p, i) =>
        /\d/.test(p) ? (
          <span key={i} className="hm__num">
            {p}
          </span>
        ) : (
          <i key={i} className="hm__letter">
            {p}
          </i>
        ),
      )}
    </span>
  );
}

export function Orbifold({ symbol, className }: { symbol?: string; className?: string }) {
  if (!symbol) return null;
  return (
    <span className={["orbifold", className].filter(Boolean).join(" ")}>
      {Array.from(symbol).map((c, i) =>
        c === "*" ? (
          <span key={i} className="orbifold__star">
            {/* a drawn asterisk: centred on the math axis in every face */}
            <svg viewBox="0 0 10 10" aria-hidden="true" focusable="false">
              <path d="M5 1v8M1.54 3l6.92 4M1.54 7l6.92-4" />
            </svg>
            <span className="visually-hidden">*</span>
          </span>
        ) : c === "×" ? (
          <span key={i} className="orbifold__cross">
            ×
          </span>
        ) : c === "o" ? (
          <span key={i} className="orbifold__o">
            o
          </span>
        ) : (
          <span key={i}>{c}</span>
        ),
      )}
    </span>
  );
}
