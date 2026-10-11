// A sized container with a <canvas> for one live simulation.
//
// The container, its sizing (useCanvasSize), visibility (useInView) and the
// play/pause/static policy are permanent. What draws into the canvas is a
// PLACEHOLDER: usePlaceholderSim runs a toy Canvas2D model. To plug in the
// real engine, replace that single hook call with the WebGPU view's hook
// (same arguments: canvas ref, size, options, mode).

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useCanvasSize } from "../hooks/useCanvasSize";
import { useGpuSupport } from "../hooks/useGpuSupport";
import { useInView } from "../hooks/useInView";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { defaultOccupancy, planeGroup, type Occupancy } from "../lib/groups";
import { usePlaceholderSim, type SimMode } from "../sim/placeholder/usePlaceholderSim";
import { useGpuSim } from "../sim/useGpuSim";
import type { Group } from "../../engine/groups/group";
import { DEFAULT_PARAMS, type ExplainerStage, type SimApi, type SimDisplay, type SimParams, type SimStats, type SimVariant } from "../sim/types";
import { PauseIcon, PlayIcon } from "./Icons";
import "../styles/components/sim-slot.css";

export interface SimSlotProps {
  variant: "hero" | "card" | "plate" | "explainer";
  seed?: number;
  className?: string;
  /** Hermann–Mauguin name of the plane group (default p4m) */
  group?: string;
  /** particles per Wyckoff letter (default: a few general + one special) */
  occupancy?: Occupancy;
  params?: SimParams;
  /** "How it works" step to illustrate (explainer only) */
  stage?: ExplainerStage;
  /** throttled (~4 Hz) readouts: phase, density, energy, T, P */
  onStats?: (s: SimStats) => void;
  /** accessible description of what the simulation shows */
  label?: string;
  /** overlays rendered above the canvas (captions, hints) */
  children?: ReactNode;
  /** a group object (e.g. a custom group) used instead of `group` */
  groupObj?: Group;
  display?: SimDisplay;
  onApi?: (api: SimApi | null) => void;
}

const INTERACTIVE: Record<SimVariant, boolean> = { hero: true, card: false, plate: true, explainer: false };

export function SimSlot({
  variant,
  seed = 1,
  className,
  group = "p4m",
  occupancy,
  params = DEFAULT_PARAMS,
  stage,
  onStats,
  label,
  children,
  groupObj,
  display,
  onApi,
}: SimSlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(canvasRef);
  const inView = useInView(containerRef, { rootMargin: "160px 0px" });
  const reducedMotion = useReducedMotion();
  const { supported } = useGpuSupport();
  // null = follow the default (play unless reduced motion), else the user's choice
  const [userPlaying, setUserPlaying] = useState<boolean | null>(null);

  const occ = useMemo(() => occupancy ?? defaultOccupancy(groupObj ?? planeGroup(group)), [occupancy, group, groupObj]);

  const wantsPlay = userPlaying ?? !reducedMotion;
  const mode: SimMode = !supported ? "static" : !wantsPlay ? (userPlaying === false ? "paused" : "static") : inView ? "live" : "paused";

  // WebGPU drives the canvas; without WebGPU the Canvas2D toy model draws a
  // static preview instead (each hook ignores the canvas when size is null)
  const driver = { variant, group, occupancy: occ, seed, params, stage, interactive: INTERACTIVE[variant] && supported, reducedMotion, onStats, groupObj, display, onApi };
  useGpuSim(canvasRef, supported ? size : null, driver, mode);
  // the toy model only knows the 17 tabulated groups
  const toyDriver = groupObj?.name === "custom" ? { ...driver, group: "p1", occupancy: { a: 6 } } : driver;
  usePlaceholderSim(canvasRef, supported ? null : size, toyDriver, mode);

  const toggle = useCallback(() => setUserPlaying(!wantsPlay), [wantsPlay]);

  const classes = ["sim-slot", `sim-slot--${variant}`, className].filter(Boolean).join(" ");
  const description = label ?? `Simulation of a ${group} crystal`;

  return (
    <div ref={containerRef} className={classes} data-mode={mode} data-interactive={INTERACTIVE[variant] || undefined}>
      <canvas ref={canvasRef} className="sim-slot__canvas" role="img" aria-label={description} />
      {children}
      {supported && (
        <button
          type="button"
          className="sim-slot__toggle"
          onClick={toggle}
          aria-label={wantsPlay ? "Pause simulation" : "Play simulation"}
          aria-pressed={!wantsPlay}
        >
          {wantsPlay ? <PauseIcon size={12} /> : <PlayIcon size={12} />}
        </button>
      )}
      {!supported && variant !== "hero" && <span className="sim-slot__static">static preview</span>}
    </div>
  );
}
