// Small dense linear algebra on row-major arrays. Sizes are tiny (D ≤ 3,
// D² ≤ 9), so clarity beats speed here; hot loops live in the engines.

export type Mat = Float64Array;

export function zeros(rows: number, cols: number): Mat {
  return new Float64Array(rows * cols);
}

export function identity(n: number): Mat {
  const m = zeros(n, n);
  for (let i = 0; i < n; i++) m[i * n + i] = 1;
  return m;
}

export function fromRows(rows: number[][]): Mat {
  const cols = rows[0]?.length ?? 0;
  const m = zeros(rows.length, cols);
  rows.forEach((r, i) => r.forEach((v, j) => (m[i * cols + j] = v)));
  return m;
}

export function toRows(m: ArrayLike<number>, rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => m[i * cols + j]),
  );
}

/** C = A (n×k) · B (k×m) */
export function matMul(a: ArrayLike<number>, b: ArrayLike<number>, n: number, k: number, m: number): Mat {
  const c = zeros(n, m);
  for (let i = 0; i < n; i++)
    for (let l = 0; l < k; l++) {
      const ail = a[i * k + l];
      if (ail === 0) continue;
      for (let j = 0; j < m; j++) c[i * m + j] += ail * b[l * m + j];
    }
  return c;
}

/** y = A (n×m) · x */
export function matVec(a: ArrayLike<number>, x: ArrayLike<number>, n: number, m: number, out?: Float64Array): Float64Array {
  const y = out ?? new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let j = 0; j < m; j++) acc += a[i * m + j] * x[j];
    y[i] = acc;
  }
  return y;
}

export function transpose(a: ArrayLike<number>, rows: number, cols: number): Mat {
  const t = zeros(cols, rows);
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) t[j * rows + i] = a[i * cols + j];
  return t;
}

/** Inverse of an n×n matrix by Gauss-Jordan with partial pivoting. Throws if singular. */
export function inverse(a: ArrayLike<number>, n: number): Mat {
  const m = Float64Array.from(a as ArrayLike<number>);
  const inv = identity(n);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r * n + col]) > Math.abs(m[piv * n + col])) piv = r;
    const p = m[piv * n + col];
    if (Math.abs(p) < 1e-300) throw new Error("singular matrix");
    if (piv !== col)
      for (let j = 0; j < n; j++) {
        [m[col * n + j], m[piv * n + j]] = [m[piv * n + j], m[col * n + j]];
        [inv[col * n + j], inv[piv * n + j]] = [inv[piv * n + j], inv[col * n + j]];
      }
    for (let j = 0; j < n; j++) {
      m[col * n + j] /= p;
      inv[col * n + j] /= p;
    }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r * n + col];
      if (f === 0) continue;
      for (let j = 0; j < n; j++) {
        m[r * n + j] -= f * m[col * n + j];
        inv[r * n + j] -= f * inv[col * n + j];
      }
    }
  }
  return inv;
}

/** Determinant via LU with partial pivoting. */
export function det(a: ArrayLike<number>, n: number): number {
  if (n === 1) return a[0];
  if (n === 2) return a[0] * a[3] - a[1] * a[2];
  if (n === 3)
    return (
      a[0] * (a[4] * a[8] - a[5] * a[7]) -
      a[1] * (a[3] * a[8] - a[5] * a[6]) +
      a[2] * (a[3] * a[7] - a[4] * a[6])
    );
  const m = Float64Array.from(a as ArrayLike<number>);
  let d = 1;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r * n + col]) > Math.abs(m[piv * n + col])) piv = r;
    if (m[piv * n + col] === 0) return 0;
    if (piv !== col) {
      d = -d;
      for (let j = 0; j < n; j++) [m[col * n + j], m[piv * n + j]] = [m[piv * n + j], m[col * n + j]];
    }
    d *= m[col * n + col];
    for (let r = col + 1; r < n; r++) {
      const f = m[r * n + col] / m[col * n + col];
      for (let j = col; j < n; j++) m[r * n + j] -= f * m[col * n + j];
    }
  }
  return d;
}

/**
 * Eigen-decomposition of a symmetric n×n matrix (cyclic Jacobi).
 * Returns eigenvalues and eigenvectors as columns of `vectors` (row-major n×n).
 */
export function symmetricEigen(a: ArrayLike<number>, n: number): { values: Float64Array; vectors: Mat } {
  const m = Float64Array.from(a as ArrayLike<number>);
  const v = identity(n);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += m[i * n + j] ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        const apq = m[p * n + q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (m[q * n + q] - m[p * n + p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = m[k * n + p];
          const akq = m[k * n + q];
          m[k * n + p] = c * akp - s * akq;
          m[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = m[p * n + k];
          const aqk = m[q * n + k];
          m[p * n + k] = c * apk - s * aqk;
          m[q * n + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k * n + p];
          const vkq = v[k * n + q];
          v[k * n + p] = c * vkp - s * vkq;
          v[k * n + q] = s * vkp + c * vkq;
        }
      }
  }
  const values = new Float64Array(n);
  for (let i = 0; i < n; i++) values[i] = m[i * n + i];
  return { values, vectors: v };
}

/**
 * Orthonormal basis (as rows, r×cols) of the row space of A (rows×cols).
 * Rows are ordered by decreasing singular value.
 */
export function rowSpaceBasis(a: ArrayLike<number>, rows: number, cols: number, tol = 1e-10): { basis: Mat; rank: number } {
  const ata = matMul(transpose(a, rows, cols), a, cols, rows, cols);
  const { values, vectors } = symmetricEigen(ata, cols);
  const maxv = Math.max(1e-300, ...values);
  const order = Array.from(values.keys()).sort((i, j) => values[j] - values[i]);
  const keep = order.filter((i) => values[i] > tol * maxv);
  const basis = zeros(keep.length, cols);
  keep.forEach((ei, r) => {
    // make the largest-magnitude component positive for determinism
    let big = 0;
    for (let c = 0; c < cols; c++) if (Math.abs(vectors[c * cols + ei]) > Math.abs(big)) big = vectors[c * cols + ei];
    const sgn = big < 0 ? -1 : 1;
    for (let c = 0; c < cols; c++) basis[r * cols + c] = sgn * vectors[c * cols + ei];
  });
  return { basis, rank: keep.length };
}

export function rank(a: ArrayLike<number>, rows: number, cols: number, tol = 1e-10): number {
  return rowSpaceBasis(a, rows, cols, tol).rank;
}

export function dot(a: ArrayLike<number>, b: ArrayLike<number>, n = a.length): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export function norm(a: ArrayLike<number>, n = a.length): number {
  return Math.sqrt(dot(a, a, n));
}
