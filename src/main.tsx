import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./site/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.DEV && new URLSearchParams(location.search).has("selftest")) {
  import("./dev/selftest").then((m) => m.runSelftest());
}
