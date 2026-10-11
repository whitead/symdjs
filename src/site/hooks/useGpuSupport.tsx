// WebGPU availability, shared through context. The site shows the
// WebGPUNotice and freezes every SimSlot when this is false.
//
// `?nogpu` forces the unsupported path for testing. The engine should call
// markUnsupported() if requestAdapter()/requestDevice() later fails.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export interface GpuSupport {
  supported: boolean;
  /** true when ?nogpu forced the notice */
  forced: boolean;
  markUnsupported: (reason?: string) => void;
  reason?: string;
}

const GpuContext = createContext<GpuSupport>({ supported: true, forced: false, markUnsupported: () => {} });

function detect(): { supported: boolean; forced: boolean } {
  if (typeof window === "undefined") return { supported: true, forced: false };
  const forced = new URLSearchParams(window.location.search).has("nogpu");
  return { supported: !forced && "gpu" in navigator && !!navigator.gpu, forced };
}

export function GpuSupportProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(detect);
  const [failure, setFailure] = useState<string | null>(null);
  const markUnsupported = useCallback((reason?: string) => setFailure(reason ?? "WebGPU device unavailable"), []);
  const value = useMemo<GpuSupport>(
    () => ({
      supported: initial.supported && failure === null,
      forced: initial.forced,
      markUnsupported,
      reason: initial.forced
        ? "forced by ?nogpu"
        : (failure ?? (initial.supported ? undefined : "navigator.gpu is missing")),
    }),
    [initial, failure, markUnsupported],
  );
  return <GpuContext.Provider value={value}>{children}</GpuContext.Provider>;
}

export function useGpuSupport(): GpuSupport {
  return useContext(GpuContext);
}
