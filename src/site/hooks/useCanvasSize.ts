// Keeps a canvas's backing store matched to its CSS box at device resolution.
// Shared by the Canvas2D placeholder and (later) the WebGPU view: WebGPU
// reads canvas.width/height when configuring the swap chain, so the same
// hook sizes both.

import { useEffect, useState, type RefObject } from "react";

export interface CanvasSize {
  /** CSS pixels */
  width: number;
  height: number;
  /** device pixels per CSS pixel actually used (capped) */
  dpr: number;
  /** backing-store size in device pixels (= canvas.width/height) */
  pixelWidth: number;
  pixelHeight: number;
}

export interface CanvasSizeOptions {
  /** cap on devicePixelRatio, to bound fill cost on 3× phones (default 2) */
  maxDpr?: number;
  /** write the size to canvas.width/height (default true) */
  apply?: boolean;
}

export function useCanvasSize(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  { maxDpr = 2, apply = true }: CanvasSizeOptions = {},
): CanvasSize | null {
  const [size, setSize] = useState<CanvasSize | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const update = (cssW: number, cssH: number, devW?: number, devH?: number) => {
      const native = window.devicePixelRatio || 1;
      const cap = Math.min(native, maxDpr);
      // device-pixel-content-box gives exact integers (no blur at fractional
      // DPR); trust it only when it agrees with the CSS size (it does not
      // under some emulators), and scale it when the DPR is capped
      const trustDev =
        devW !== undefined && devH !== undefined && Math.abs(devW - cssW * native) <= 1.5 && Math.abs(devH - cssH * native) <= 1.5;
      const scale = cap / native;
      const pixelWidth = Math.max(1, Math.round(trustDev ? devW! * scale : cssW * cap));
      const pixelHeight = Math.max(1, Math.round(trustDev ? devH! * scale : cssH * cap));
      // the ratio actually realised, so drawing code can rely on it
      const dpr = cssW > 0 ? pixelWidth / cssW : cap;
      if (apply && (canvas.width !== pixelWidth || canvas.height !== pixelHeight)) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      setSize((prev) =>
        prev &&
        prev.pixelWidth === pixelWidth &&
        prev.pixelHeight === pixelHeight &&
        prev.width === cssW &&
        prev.height === cssH
          ? prev
          : { width: cssW, height: cssH, dpr, pixelWidth, pixelHeight },
      );
    };

    const ro = new ResizeObserver((entries) => {
      const e = entries[entries.length - 1];
      const box = e.contentBoxSize?.[0];
      const dev = e.devicePixelContentBoxSize?.[0];
      const cssW = box ? box.inlineSize : e.contentRect.width;
      const cssH = box ? box.blockSize : e.contentRect.height;
      update(cssW, cssH, dev?.inlineSize, dev?.blockSize);
    });
    try {
      ro.observe(canvas, { box: "device-pixel-content-box" });
    } catch {
      ro.observe(canvas, { box: "content-box" });
    }

    // devicePixelRatio changes (zoom, moving between displays)
    let mql: MediaQueryList | null = null;
    const onDpr = () => {
      const r = canvas.getBoundingClientRect();
      update(r.width, r.height);
      watchDpr();
    };
    const watchDpr = () => {
      mql?.removeEventListener("change", onDpr);
      mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mql.addEventListener("change", onDpr);
    };
    watchDpr();

    return () => {
      ro.disconnect();
      mql?.removeEventListener("change", onDpr);
    };
  }, [canvasRef, maxDpr, apply]);

  return size;
}
