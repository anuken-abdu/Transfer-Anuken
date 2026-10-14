import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/manrope";
import "./styles.css";
import App from "./App";
import { ToastHost } from "./components/ui";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastHost><App /></ToastHost>
  </StrictMode>,
);
