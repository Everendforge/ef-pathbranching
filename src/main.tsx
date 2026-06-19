import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "./app.css";
import { App } from "./App";

const root = document.querySelector<HTMLDivElement>("#root");

if (!root) {
  throw new Error("Missing React root.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
