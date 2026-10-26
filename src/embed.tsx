import { StrictMode, useState } from "react";
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

const groups = planeGroups();

function Embed() {
  const { supported } = useGpuSupport();
  const [selectedName, setSelectedName] = useState(() => new URLSearchParams(window.location.search).get("group") ?? "p4m");
  const group = groups.find((g) => g.name === selectedName);
  const changeGroup = (name: string) => {
    setSelectedName(name);
    const url = new URL(window.location.href);
    url.searchParams.set("group", name);
    window.history.replaceState(window.history.state, "", url);
  };

  return (
    <main className="embed">
      <div className="embed__picker">
        <label htmlFor="embed-group">Wallpaper group</label>
        <select id="embed-group" value={group?.name ?? ""} onChange={(event) => changeGroup(event.currentTarget.value)}>
          {!group && <option value="" disabled>Choose a group</option>}
          {groups.map((option) => <option key={option.name} value={option.name}>{option.name}</option>)}
        </select>
      </div>
      {!group ? (
        <p className="embed__notice">
          Unknown wallpaper group “{selectedName}”. Choose a group above or visit the <a href="./">atlas</a>.
        </p>
      ) : !supported ? (
        <p className="embed__notice">
          This simulation needs WebGPU in a supported browser. <a href="./">Open the atlas</a> to learn more.
        </p>
      ) : (
        <ol className="embed__card" aria-label={`${group.name} wallpaper group simulation`}>
          <Tile
            key={group.name}
            group={group}
            initial={randomOccupancy(group, new Rng(1 + 101 * group.number))}
            seed={1 + 101 * group.number}
            pressure={null}
          />
        </ol>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GpuSupportProvider>
      <Embed />
    </GpuSupportProvider>
  </StrictMode>,
);
