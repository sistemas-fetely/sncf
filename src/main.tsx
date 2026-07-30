import { createRoot } from "react-dom/client";
import { Component, type ErrorInfo, type ReactNode } from "react";
import App from "./App.tsx";
import "./index.css";
import "./styles/sidebar-fetely.css";

const isChunkLoadError = (msg: string) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically imported module/i.test(msg);

// Sinais fora do ciclo de render do React. Só registram — nada recarrega
// sozinho: reload automático interrompe digitação em tela operacional.
window.addEventListener("error", (e) => {
  const msg = [e.message, e.error?.message, String(e.error ?? "")].filter(Boolean).join(" ");
  if (isChunkLoadError(msg)) console.warn("Chunk lazy obsoleto detectado fora do render.");
});

window.addEventListener("unhandledrejection", (e) => {
  const msg = (e.reason?.message ?? String(e.reason ?? "")) as string;
  if (isChunkLoadError(msg)) console.warn("Chunk lazy obsoleto detectado fora do render.");
});

const estilos = {
  fundo: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    background: "#fafafa",
    color: "#18181b",
  } as const,
  caixa: {
    maxWidth: "520px",
    width: "100%",
    background: "#fff",
    border: "1px solid #e4e4e7",
    borderRadius: "12px",
    padding: "28px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  } as const,
  titulo: { margin: "0 0 8px", fontSize: "18px", fontWeight: 600 } as const,
  texto: { margin: "0 0 6px", fontSize: "14px", lineHeight: 1.55, color: "#52525b" } as const,
  aviso: { margin: "12px 0 0", fontSize: "13px", lineHeight: 1.5, color: "#a16207" } as const,
  detalhe: {
    margin: "16px 0 0",
    padding: "10px 12px",
    background: "#fafafa",
    border: "1px solid #e4e4e7",
    borderRadius: "8px",
    fontSize: "12px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    color: "#3f3f46",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    maxHeight: "160px",
    overflow: "auto",
  } as const,
  botoes: { display: "flex", gap: "10px", marginTop: "22px", flexWrap: "wrap" as const } as const,
  primario: {
    padding: "9px 16px",
    fontSize: "14px",
    fontWeight: 500,
    borderRadius: "8px",
    border: "none",
    background: "#18181b",
    color: "#fff",
    cursor: "pointer",
  } as const,
  secundario: {
    padding: "9px 16px",
    fontSize: "14px",
    fontWeight: 500,
    borderRadius: "8px",
    border: "1px solid #d4d4d8",
    background: "#fff",
    color: "#18181b",
    cursor: "pointer",
  } as const,
};

interface EstadoBoundary {
  erro: Error | null;
}

class ChunkErrorBoundary extends Component<{ children: ReactNode }, EstadoBoundary> {
  state: EstadoBoundary = { erro: null };

  static getDerivedStateFromError(erro: Error): EstadoBoundary {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    const msg = erro?.message ?? String(erro ?? "");
    if (isChunkLoadError(msg)) {
      console.warn("Chunk lazy obsoleto: versão nova publicada, aba com index.html antigo.");
    } else {
      console.error("Erro capturado pelo boundary raiz:", erro, info?.componentStack);
    }
  }

  render() {
    const { erro } = this.state;
    if (!erro) return this.props.children;

    const ehChunk = isChunkLoadError(erro?.message ?? String(erro ?? ""));

    if (ehChunk) {
      return (
        <div style={estilos.fundo}>
          <div style={estilos.caixa}>
            <h1 style={estilos.titulo}>O sistema foi atualizado</h1>
            <p style={estilos.texto}>
              Uma versão nova do SNCF foi publicada enquanto esta aba estava aberta.
              Recarregue para continuar.
            </p>
            <p style={estilos.aviso}>
              Se você tem algo não salvo nesta tela, copie antes de recarregar.
            </p>
            <div style={estilos.botoes}>
              <button style={estilos.primario} onClick={() => window.location.reload()}>
                Recarregar agora
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={estilos.fundo}>
        <div style={estilos.caixa}>
          <h1 style={estilos.titulo}>Algo quebrou nesta tela</h1>
          <p style={estilos.texto}>
            O erro está abaixo. Se persistir depois de tentar de novo, manda esse texto
            para quem cuida do sistema.
          </p>
          <div style={estilos.detalhe}>{erro?.message ?? String(erro)}</div>
          <div style={estilos.botoes}>
            <button style={estilos.primario} onClick={() => this.setState({ erro: null })}>
              Tentar de novo
            </button>
            <button style={estilos.secundario} onClick={() => window.location.reload()}>
              Recarregar a página
            </button>
          </div>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <ChunkErrorBoundary>
    <App />
  </ChunkErrorBoundary>
);
