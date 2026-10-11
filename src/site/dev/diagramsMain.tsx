import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DiagramsDev } from "./DiagramsDev";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DiagramsDev />
  </StrictMode>,
);
