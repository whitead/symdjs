// An Atlas of Symmetric Molecular Dynamics: page shell.

import "@fontsource-variable/fraunces/full.css";
import "@fontsource-variable/fraunces/full-italic.css";
import "@fontsource-variable/ibm-plex-sans/wght.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/400-italic.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./styles/tokens.css";
import "./styles/base.css";

import { WebGPUNotice } from "./components/WebGPUNotice";
import { GpuSupportProvider, useGpuSupport } from "./hooks/useGpuSupport";
import { Atlas } from "./sections/Atlas";
import { Footer } from "./sections/Footer";
import { Hero } from "./sections/Hero";
import { HowItWorks } from "./sections/HowItWorks";

export function App() {
  return (
    <GpuSupportProvider>
      <Page />
    </GpuSupportProvider>
  );
}

function Page() {
  const { supported } = useGpuSupport();
  // every plate is a live simulation: without WebGPU there is nothing to show
  if (!supported) return <WebGPUNotice />;
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to the atlas
      </a>
      <Hero />
      <main id="main">
        <Atlas />
        <HowItWorks />
      </main>
      <Footer />
    </>
  );
}
