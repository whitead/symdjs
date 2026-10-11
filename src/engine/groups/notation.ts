// Parser for crystallographic "xyz" notation: affine ops like "-y,x-y" or
// "x + 1/2,-y + 1/2", Wyckoff sites like "2x,x", and asymmetric-unit
// inequalities like "0≤x≤2/3;y≤min(1-x,(1+x)/2)". Works in any dimension ≤ 3.

import { affineFrom, type Affine } from "../math/affine";

const VARS = ["x", "y", "z"] as const;

/** a·(x,y,z) + c */
export interface LinearForm {
  coef: [number, number, number];
  c: number;
}

type Value = { kind: "lin"; f: LinearForm } | { kind: "min" | "max"; args: LinearForm[] };

type Token =
  | { t: "num"; v: number }
  | { t: "var"; i: number }
  | { t: "fn"; name: "min" | "max" }
  | { t: "op"; v: "+" | "-" | "*" | "/" | "(" | ")" | "," };

function tokenize(src: string): Token[] {
  const s = src.replace(/−/g, "-").replace(/\s+/g, "");
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      out.push({ t: "num", v: parseFloat(s.slice(i, j)) });
      i = j;
    } else if (s.startsWith("min", i) || s.startsWith("max", i)) {
      out.push({ t: "fn", name: s.slice(i, i + 3) as "min" | "max" });
      i += 3;
    } else if (VARS.includes(ch as (typeof VARS)[number])) {
      out.push({ t: "var", i: VARS.indexOf(ch as (typeof VARS)[number]) });
      i++;
    } else if ("+-*/(),".includes(ch)) {
      out.push({ t: "op", v: ch as "+" });
      i++;
    } else {
      throw new Error(`unexpected character '${ch}' in "${src}"`);
    }
  }
  return out;
}

const lin = (coef: [number, number, number], c: number): Value => ({ kind: "lin", f: { coef, c } });
const asLin = (v: Value, src: string): LinearForm => {
  if (v.kind !== "lin") throw new Error(`min/max not allowed here in "${src}"`);
  return v.f;
};

class Parser {
  private p = 0;
  constructor(
    private toks: Token[],
    private src: string,
  ) {}

  private peek(): Token | undefined {
    return this.toks[this.p];
  }
  private isOp(v: string): boolean {
    const t = this.peek();
    return t?.t === "op" && t.v === v;
  }
  private expect(v: string) {
    if (!this.isOp(v)) throw new Error(`expected '${v}' in "${this.src}"`);
    this.p++;
  }
  done(): boolean {
    return this.p >= this.toks.length;
  }

  expr(): Value {
    let left = this.term();
    while (this.isOp("+") || this.isOp("-")) {
      const sign = (this.toks[this.p++] as { v: string }).v === "+" ? 1 : -1;
      const right = asLin(this.term(), this.src);
      const l = asLin(left, this.src);
      left = lin(
        [l.coef[0] + sign * right.coef[0], l.coef[1] + sign * right.coef[1], l.coef[2] + sign * right.coef[2]],
        l.c + sign * right.c,
      );
    }
    return left;
  }

  private term(): Value {
    let left = this.unary();
    for (;;) {
      if (this.isOp("*") || this.isOp("/")) {
        const op = (this.toks[this.p++] as { v: string }).v;
        left = this.combine(left, this.unary(), op as "*" | "/");
      } else {
        const t = this.peek();
        // implicit multiplication: "2x", "2(x+1)"
        const prevIsConst = left.kind === "lin" && left.f.coef.every((c) => c === 0);
        if (prevIsConst && t && (t.t === "var" || (t.t === "op" && t.v === "(") || t.t === "fn")) {
          left = this.combine(left, this.unary(), "*");
        } else break;
      }
    }
    return left;
  }

  private combine(a: Value, b: Value, op: "*" | "/"): Value {
    const fa = asLin(a, this.src);
    const fb = asLin(b, this.src);
    const bConst = fb.coef.every((c) => c === 0);
    const aConst = fa.coef.every((c) => c === 0);
    if (op === "/") {
      if (!bConst) throw new Error(`non-constant divisor in "${this.src}"`);
      return lin([fa.coef[0] / fb.c, fa.coef[1] / fb.c, fa.coef[2] / fb.c], fa.c / fb.c);
    }
    if (bConst) return lin([fa.coef[0] * fb.c, fa.coef[1] * fb.c, fa.coef[2] * fb.c], fa.c * fb.c);
    if (aConst) return lin([fb.coef[0] * fa.c, fb.coef[1] * fa.c, fb.coef[2] * fa.c], fb.c * fa.c);
    throw new Error(`non-linear product in "${this.src}"`);
  }

  private unary(): Value {
    if (this.isOp("-")) {
      this.p++;
      const v = asLin(this.unary(), this.src);
      return lin([-v.coef[0], -v.coef[1], -v.coef[2]], -v.c);
    }
    if (this.isOp("+")) {
      this.p++;
      return this.unary();
    }
    return this.primary();
  }

  private primary(): Value {
    const t = this.peek();
    if (!t) throw new Error(`unexpected end of "${this.src}"`);
    this.p++;
    if (t.t === "num") return lin([0, 0, 0], t.v);
    if (t.t === "var") {
      const coef: [number, number, number] = [0, 0, 0];
      coef[t.i] = 1;
      return lin(coef, 0);
    }
    if (t.t === "fn") {
      this.expect("(");
      const args = [asLin(this.expr(), this.src)];
      while (this.isOp(",")) {
        this.p++;
        args.push(asLin(this.expr(), this.src));
      }
      this.expect(")");
      return { kind: t.name, args };
    }
    if (t.v === "(") {
      const v = this.expr();
      this.expect(")");
      return v;
    }
    throw new Error(`unexpected '${t.v}' in "${this.src}"`);
  }
}

function parseValue(src: string): Value {
  const p = new Parser(tokenize(src), src);
  const v = p.expr();
  if (!p.done()) throw new Error(`trailing input in "${src}"`);
  return v;
}

export function parseLinear(src: string): LinearForm {
  return asLin(parseValue(src), src);
}

/** Split on commas that are not inside parentheses. */
function splitTopLevel(src: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of src) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === sep && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts;
}

/**
 * Parse an op like "-y,x-y" (or a Wyckoff site like "2x,x", where x,y,z
 * are free parameters) into an affine map.
 */
export function parseOp(src: string, D: number): Affine {
  const comps = splitTopLevel(src, ",");
  if (comps.length !== D) throw new Error(`expected ${D} components in "${src}"`);
  const R = new Float64Array(D * D);
  const t = new Float64Array(D);
  comps.forEach((c, i) => {
    const f = parseLinear(c);
    for (let j = 0; j < 3; j++) {
      if (j >= D && f.coef[j] !== 0) throw new Error(`variable ${VARS[j]} used in ${D}D op "${src}"`);
      if (j < D) R[i * D + j] = f.coef[j] + 0; // normalize -0
    }
    t[i] = f.c + 0;
  });
  return affineFrom(D, R, t);
}

/** Half-space a·s ≤ b */
export interface HalfSpace {
  a: number[];
  b: number;
}

/**
 * Parse asymmetric-unit inequalities, e.g. "0≤x≤2/3;0≤y≤1/3;x≤(1+y)/2;y≤x/2".
 * min() is allowed on the larger side and max() on the smaller side
 * (both describe convex regions).
 */
export function parseInequalities(src: string, D: number): HalfSpace[] {
  const out: HalfSpace[] = [];
  for (const clause of src.split(";").map((c) => c.trim()).filter(Boolean)) {
    const normalized = clause.replace(/<=/g, "≤").replace(/>=/g, "≥").replace(/</g, "≤").replace(/>/g, "≥");
    const pieces = normalized.split(/([≤≥])/);
    const exprs: Value[] = [];
    const ops: string[] = [];
    pieces.forEach((p, i) => (i % 2 === 0 ? exprs.push(parseValue(p)) : ops.push(p)));
    for (let k = 0; k < ops.length; k++) {
      // normalize to small ≤ big
      const [small, big] = ops[k] === "≤" ? [exprs[k], exprs[k + 1]] : [exprs[k + 1], exprs[k]];
      const smalls = small.kind === "lin" ? [small.f] : small.kind === "max" ? small.args : null;
      const bigs = big.kind === "lin" ? [big.f] : big.kind === "min" ? big.args : null;
      if (!smalls || !bigs) throw new Error(`non-convex inequality in "${clause}"`);
      for (const s of smalls)
        for (const b of bigs) {
          const a = Array.from({ length: D }, (_, j) => s.coef[j] - b.coef[j]);
          for (let j = D; j < 3; j++)
            if (s.coef[j] - b.coef[j] !== 0) throw new Error(`variable ${VARS[j]} in ${D}D inequality`);
          out.push({ a, b: b.c - s.c });
        }
    }
  }
  return out;
}

export function insideHalfSpaces(hs: HalfSpace[], s: ArrayLike<number>, tol = 1e-12): boolean {
  return hs.every((h) => {
    let v = 0;
    for (let j = 0; j < h.a.length; j++) v += h.a[j] * s[j];
    return v <= h.b + tol;
  });
}
