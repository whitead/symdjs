// A sized container with a <canvas> for one live simulation, driven by the
// WebGPU engine (useGpuSim). The page only renders when WebGPU is present.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useCanvasSize } from "../hooks/useCanvasSize";
import { useInView } from "../hooks/useInView";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { defaultOccupancy, planeGroup, type Occupancy } from "../lib/groups";
import type { ExplainerStage, SimMode, SimVariant } from "../sim/types";
import { useGpuSim } from "../sim/useGpuSim";
import { MaximizeIcon, MinimizeIcon, PauseIcon, PlayIcon } from "./Icons";
import "../styles/components/sim-slot.css";

export interface SimSlotProps {
  variant: SimVariant;
  seed?: number;
  className?: string;
  /** Hermann–Mauguin name of the plane group (default p4m) */
  group?: string;
  /** particles per Wyckoff letter (default: a few general + one special) */
  occupancy?: Occupancy;
  /** "How it works" step to illustrate (explainer only) */
  stage?: ExplainerStage;
  /** run without the symmetry constraint (a p1 supercell of the current cell) */
  released?: boolean;
  /** barostat pressure (null = fixed volume) */
  pressure?: number | null;
  /** accessible description of what the simulation shows */
  label?: string;
  /** overlays rendered above the canvas (captions, hints) */
  children?: ReactNode;
}

const INTERACTIVE: Record<SimVariant, boolean> = { hero: false, tile: true, explainer: false };

export function SimSlot({
  variant,
  seed = 1,
  className,
  group = "p4m",
  occupancy,
  stage,
  released,
  pressure,
  label,
  children,
}: SimSlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(canvasRef);
  const inView = useInView(containerRef, { rootMargin: "160px 0px" });
  const reducedMotion = useReducedMotion();
  // null = follow the default (play unless reduced motion), else the user's choice
  const [userPlaying, setUserPlaying] = useState<boolean | null>(null);

  const occ = useMemo(() => occupancy ?? defaultOccupancy(planeGroup(group)), [occupancy, group]);

  const wantsPlay = userPlaying ?? !reducedMotion;
  const mode: SimMode = !wantsPlay ? (userPlaying === false ? "paused" : "static") : inView ? "live" : "paused";


  const toggle = useCallback(() => setUserPlaying(!wantsPlay), [wantsPlay]);

  // maximize: real fullscreen where available, else a full-window overlay
  const [maximized, setMaximized] = useState<"off" | "fullscreen" | "overlay">("off");
  useEffect(() => {
    const onChange = () => {
      const fs = document.fullscreenElement === containerRef.current;
      setMaximized((m) => (fs ? "fullscreen" : m === "fullscreen" ? "off" : m));
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  useEffect(() => {
    if (maximized !== "overlay") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMaximized("off");
    window.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [maximized]);
  const toggleMax = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (maximized === "fullscreen") void document.exitFullscreen();
    else if (maximized === "overlay") setMaximized("off");
    else if (el.requestFullscreen && document.fullscreenEnabled)
      el.requestFullscreen().catch(() => setMaximized("overlay"));
    else setMaximized("overlay");
  }, [maximized]);

  useGpuSim(
    canvasRef,
    size,
    { variant, group, occupancy: occ, seed, stage, released, pressure, interactive: INTERACTIVE[variant], reducedMotion, maximized: maximized !== "off" },
    mode,
  );

  const classes = ["sim-slot", `sim-slot--${variant}`, className].filter(Boolean).join(" ");
  const description = label ?? `Simulation of a ${group} crystal`;

  return (
    <div
      ref={containerRef}
      className={classes}
      data-mode={mode}
      data-interactive={INTERACTIVE[variant] || undefined}
      data-max={maximized !== "off" ? maximized : undefined}
    >
      <canvas ref={canvasRef} className="sim-slot__canvas" role="img" aria-label={description} />
      {children}
      <button
        type="button"
        className="sim-slot__toggle"
        onClick={toggle}
        aria-label={wantsPlay ? "Pause simulation" : "Play simulation"}
        aria-pressed={!wantsPlay}
      >
        {wantsPlay ? <PauseIcon size={12} /> : <PlayIcon size={12} />}
      </button>
      <button
        type="button"
        className="sim-slot__max"
        onClick={toggleMax}
        aria-label={maximized !== "off" ? "Exit full screen" : "Show full screen"}
        aria-pressed={maximized !== "off"}
      >
        {maximized !== "off" ? <MinimizeIcon size={13} /> : <MaximizeIcon size={13} />}
      </button>
    </div>
  );
}
