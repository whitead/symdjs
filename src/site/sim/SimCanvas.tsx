import { useEffect, useRef } from "react";
import type { GpuSystem } from "../../engine/gpu/engine";
import { useSimSystem, type SimConfig, type UseSimOptions } from "./useSim";

export interface SimCanvasProps extends UseSimOptions {
  config: SimConfig | null;
  className?: string;
  style?: React.CSSProperties;
  onSystem?: (sys: GpuSystem | null, replace: (s: GpuSystem) => void) => void;
  ariaLabel?: string;
}

/** A canvas showing a live symmetric simulation. */
export function SimCanvas({ config, className, style, onSystem, ariaLabel, ...opts }: SimCanvasProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const { sys, replace } = useSimSystem(ref, config, opts);
  useEffect(() => {
    onSystem?.(sys, replace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sys]);
  return (
    <canvas
      ref={ref}
      className={className}
      style={{ display: "block", width: "100%", height: "100%", touchAction: opts.interactive ? "none" : undefined, ...style }}
      role="img"
      aria-label={ariaLabel ?? (config ? `Live simulation in plane group ${config.group.name}` : "simulation")}
    />
  );
}
