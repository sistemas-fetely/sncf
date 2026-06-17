import { createRoot } from "react-dom/client";
import { Component, type ErrorInfo, type ReactNode } from "react";
import App from "./App.tsx";
import "./index.css";
import "./styles/sidebar-fetely.css";

// Detecta chunk lazy obsoleto sem recarregar a tela automaticamente.
// O reload automático interrompia edição/digitação em telas operacionais.
const isChunkLoadError = (msg: string) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically imported module/i.test(msg);

window.addEventListener("error", (e) => {
  const msg = [e.message, e.error?.message, String(e.error ?? "")].filter(Boolean).join(" ");
  if (isChunkLoadError(msg)) console.warn("Chunk lazy obsoleto detectado; reload automático desativado.");
});

window.addEventListener("unhandledrejection", (e) => {
  const msg = (e.reason?.message ?? String(e.reason ?? "")) as string;
  if (isChunkLoadError(msg)) console.warn("Chunk lazy obsoleto detectado; reload automático desativado.");
});

class ChunkErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    if (isChunkLoadError(error?.message ?? String(error ?? ""))) {
      console.warn("Chunk lazy obsoleto detectado; reload automático desativado.");
    } else {
      console.error(error);
    }
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <ChunkErrorBoundary>
    <App />
  </ChunkErrorBoundary>
);

