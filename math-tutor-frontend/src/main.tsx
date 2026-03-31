import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/app/App";
import { AppProviders } from "@/app/providers/AppProviders";
import { reportFrontendRuntimeDiagnostics } from "@/app/runtime/releaseDiagnostics";
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
