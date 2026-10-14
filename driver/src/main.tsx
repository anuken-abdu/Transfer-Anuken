import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/manrope";
import "./styles.css";
import App from "./App";
import { ToastHost } from "./ui";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastHost><App /></ToastHost>
  </StrictMode>,
);

// Установка на телефон и работа при плохой связи. В демо и превью не регистрируем.
if ("serviceWorker" in navigator && import.meta.env.PROD && import.meta.env.VITE_DEMO !== "1") {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); });
}
