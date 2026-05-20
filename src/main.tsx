import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/sidebar-fetely.css";

// Auto-reload quando um chunk lazy fica obsoleto após novo deploy.
// Evita tela branca com "Failed to fetch dynamically imported module".
const isChunkLoadError = (msg: string) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically imported module/i.test(msg);

const RELOAD_KEY = "__chunk_reload_ts__";
const RELOAD_COOLDOWN_MS = 30_000;

function tryReload() {
  const now = Date.now();
  const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? "0");
  if (now - last < RELOAD_COOLDOWN_MS) return;
  sessionStorage.setItem(RELOAD_KEY, String(now));
  window.location.reload();
}

window.addEventListener("error", (e) => {
  if (isChunkLoadError(e.message ?? "")) tryReload();
});

window.addEventListener("unhandledrejection", (e) => {
  const msg = (e.reason?.message ?? String(e.reason ?? "")) as string;
  if (isChunkLoadError(msg)) tryReload();
});

createRoot(document.getElementById("root")!).render(<App />);

