// Shown instead of the whole site when WebGPU is unavailable (or with
// ?nogpu): a p4m wallpaper behind a short note on paper.

import { useMemo } from "react";
import { planeGroup } from "../lib/groups";
import { applyAffine } from "../../engine/math/affine";
import { useGpuSupport } from "../hooks/useGpuSupport";
import { PALETTE } from "../lib/palette";
import "../styles/components/webgpu-notice.css";

const BROWSERS = [
  { name: "Chrome & Edge", detail: "recent versions on Windows, macOS, ChromeOS and Android" },
  { name: "Safari 26+", detail: "macOS, iOS and iPadOS" },
  { name: "Firefox", detail: "recent versions on Windows and macOS" },
];

const TILE = 120;

/** Disc positions for one p4m cell: three orbits, coloured from the palette. */
function useWallpaper() {
  return useMemo(() => {
    const g = planeGroup("p4m");
    const seeds: [number, number, string, number][] = [
      [0.17, 0.06, PALETTE[0], 7.2],
      [0.33, 0.16, PALETTE[9], 6.4],
      [0.5, 0.5, PALETTE[4], 9.5],
      [0.25, 0.5, PALETTE[6], 6],
    ];
    const discs: { x: number; y: number; r: number; fill: string }[] = [];
    for (const [x, y, fill, r] of seeds) {
      const seen = new Set<string>();
      for (const op of g.ops) {
        const p = applyAffine(op, [x, y]);
        for (let i = -1; i <= 1; i++)
          for (let j = -1; j <= 1; j++) {
            const fx = p[0] - Math.floor(p[0]) + i;
            const fy = p[1] - Math.floor(p[1]) + j;
            if (fx < -0.1 || fx > 1.1 || fy < -0.1 || fy > 1.1) continue;
            const key = `${fx.toFixed(3)},${fy.toFixed(3)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            discs.push({ x: fx * TILE, y: fy * TILE, r, fill });
          }
      }
    }
    return discs;
  }, []);
}

export function WebGPUNotice() {
  const { forced, reason } = useGpuSupport();
  const discs = useWallpaper();
  const clearFlag = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("nogpu");
    return url.pathname + (url.search ? url.search : "") + url.hash;
  };

  return (
    <header className="gpu-notice" id="top" aria-labelledby="gpu-title">
      <svg className="gpu-notice__pattern" aria-hidden="true" focusable="false">
        <defs>
          <pattern id="gpu-wallpaper" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
            <path
              d={`M0 0H${TILE}V${TILE}H0Z M0 0L${TILE} ${TILE} M${TILE} 0L0 ${TILE} M${TILE / 2} 0V${TILE} M0 ${TILE / 2}H${TILE}`}
              className="gpu-notice__mirrors"
            />
            {discs.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={d.fill} className="gpu-notice__disc" />
            ))}
          </pattern>
          <radialGradient id="gpu-fade" cx="50%" cy="46%" r="70%">
            <stop offset="0.25" stopColor="#000" />
            <stop offset="0.9" stopColor="#fff" />
          </radialGradient>
          <mask id="gpu-mask">
            <rect width="100%" height="100%" fill="url(#gpu-fade)" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="url(#gpu-wallpaper)" mask="url(#gpu-mask)" />
      </svg>

      <div className="gpu-notice__frame" aria-hidden="true" />

      <div className="gpu-notice__card">
        <p className="gpu-notice__kicker">A note to the reader</p>
        <h1 className="gpu-notice__title" id="gpu-title">
          This atlas needs <em>WebGPU</em>
        </h1>
        <p className="gpu-notice__lede">
          Every plate in <cite>An atlas of 2D crystals</cite> is a live simulation computed on your
          graphics card, and this browser does not offer WebGPU.
        </p>
        <h2 className="gpu-notice__subhead">Browsers that will run it</h2>
        <ul className="gpu-notice__browsers">
          {BROWSERS.map((b) => (
            <li key={b.name}>
              <span className="gpu-notice__browser">{b.name}</span>
              <span className="gpu-notice__detail">{b.detail}</span>
            </li>
          ))}
        </ul>
        <p className="gpu-notice__small">
          WebGPU may also be switched off by a setting, an extension or an older graphics driver.
          {reason && <span className="gpu-notice__reason"> ({reason})</span>}
          {forced && (
            <>
              {" "}
              <a href={clearFlag()}>Remove ?nogpu</a>
            </>
          )}
        </p>
        <p className="gpu-notice__small">
          After S. Cox &amp; A. D. White,{" "}
          <a href="https://doi.org/10.1021/acs.jctc.2c00401">
            <cite>Symmetric Molecular Dynamics</cite>
          </a>
          , J. Chem. Theory Comput. 18, 4077 (2022).
        </p>
      </div>
    </header>
  );
}
