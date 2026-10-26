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
import { ChevronLeftIcon, ChevronRightIcon } from "./site/components/Icons";
import { GpuSupportProvider, useGpuSupport } from "./site/hooks/useGpuSupport";
import { planeGroups, randomOccupancy, toRoman } from "./site/lib/groups";
import { Rng } from "./engine/math/rng";

const groups = planeGroups();

function GroupNavigation({ selectedName, onChange }: { selectedName: string; onChange: (name: string) => void }) {
  const index = groups.findIndex((group) => group.name === selectedName);
  const previous = index < 0 ? null : groups[(index - 1 + groups.length) % groups.length];
  const next = index < 0 ? null : groups[(index + 1) % groups.length];

  return (
    <nav className="embed__navigation" aria-label="Wallpaper group navigation">
      <button
        type="button"
        className="embed__step"
        onClick={() => previous && onChange(previous.name)}
        disabled={!previous}
        aria-label={`Previous wallpaper group${previous ? `: ${previous.name}` : ""}`}
        title={previous?.name}
      >
        <ChevronLeftIcon size={19} />
      </button>
      <div className="embed__choice">
        <p className="embed__index">Browse plane groups</p>
        <div className="embed__select-wrap">
          <label className="visually-hidden" htmlFor="embed-group">Wallpaper group</label>
          <span className="embed__selected" aria-hidden="true">
            {index < 0 ? "Choose a group" : (
              <>
                <span className="embed__ordinal">{toRoman(index + 1)}</span>
                <span className="embed__divider"> / </span>
                {toRoman(groups.length)}
              </>
            )}
          </span>
          <select id="embed-group" value={index < 0 ? "" : selectedName} onChange={(event) => onChange(event.currentTarget.value)}>
            {index < 0 && <option value="" disabled>Choose a group</option>}
            {groups.map((option) => <option key={option.name} value={option.name}>{option.name}</option>)}
          </select>
        </div>
      </div>
      <button
        type="button"
        className="embed__step"
        onClick={() => next && onChange(next.name)}
        disabled={!next}
        aria-label={`Next wallpaper group${next ? `: ${next.name}` : ""}`}
        title={next?.name}
      >
        <ChevronRightIcon size={19} />
      </button>
    </nav>
  );
}

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
  const navigation = <GroupNavigation selectedName={selectedName} onChange={changeGroup} />;

  return (
    <main className="embed">
      {!group ? (
        <>
          {navigation}
          <p className="embed__notice">
            Unknown wallpaper group “{selectedName}”. Choose a group above or visit the <a href="./">atlas</a>.
          </p>
        </>
      ) : !supported ? (
        <>
          {navigation}
          <p className="embed__notice">
            This simulation needs WebGPU in a supported browser. <a href="./">Open the atlas</a> to learn more.
          </p>
        </>
      ) : (
        <ol className="embed__card" aria-label={`${group.name} wallpaper group simulation`}>
          <Tile
            key={group.name}
            group={group}
            initial={randomOccupancy(group, new Rng(1 + 101 * group.number))}
            seed={1 + 101 * group.number}
            pressure={null}
            afterVisualization={navigation}
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
