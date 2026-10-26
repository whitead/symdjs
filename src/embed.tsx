import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/fraunces/full.css";
import "@fontsource-variable/fraunces/full-italic.css";
import "@fontsource-variable/ibm-plex-sans/wght.css";
import "@fontsource/ibm-plex-mono/400.css";
import "./site/styles/tokens.css";
import "./site/styles/base.css";
import "./site/styles/embed.css";
import { Tile } from "./site/components/Tile";
import { GpuSupportProvider, useGpuSupport } from "./site/hooks/useGpuSupport";
import { planeGroups, randomOccupancy } from "./site/lib/groups";
import { Rng } from "./engine/math/rng";

const requestedGroup = new URLSearchParams(window.location.search).get("group") ?? "p4m";
const group = planeGroups().find((g) => g.name === requestedGroup);

function Embed() {
  const { supported } = useGpuSupport();

  if (!group) {
    return (
      <p className="embed__notice">
        Unknown wallpaper group “{requestedGroup}”. Choose one of the 17 groups in the <a href="./">atlas</a>.
      </p>
    );
  }

  if (!supported) {
    return (
      <p className="embed__notice">
        This simulation needs WebGPU in a supported browser. <a href="./">Open the atlas</a> to learn more.
      </p>
    );
  }

  const seed = 1 + 101 * group.number;
  return (
    <ol className="embed__card" aria-label={`${group.name} wallpaper group simulation`}>
      <Tile group={group} initial={randomOccupancy(group, new Rng(seed))} seed={seed} pressure={null} />
    </ol>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GpuSupportProvider>
      <Embed />
    </GpuSupportProvider>
  </StrictMode>,
);
