import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/app/App";
import { AppProviders } from "@/app/providers/AppProviders";
import { reportFrontendRuntimeDiagnostics } from "@/app/runtime/releaseDiagnostics";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/commissioner/500.css";
import "@fontsource/commissioner/600.css";
import "@fontsource/commissioner/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./index.css";
import "@/styles/fluid-system.css";
import "@/styles/design-system.css";
import "@/styles/visual-refactor-overrides.scss";

reportFrontendRuntimeDiagnostics();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </React.StrictMode>
);
