import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/500.css";
import "@fontsource/public-sans/600.css";
import "@fontsource/barlow-semi-condensed/600.css";
import "leaflet/dist/leaflet.css";
import "./styles/tokens.css";
import { App } from "./App.js";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found in DOM");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
