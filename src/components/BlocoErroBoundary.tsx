/**
 * Boundary local — FAIL-LOUD sem derrubar a aplicação.
 *
 * Qualquer erro de render dentro do bloco vira um cartão vermelho com a
 * mensagem real do erro; o resto da tela continua vivo e utilizável.
 * Nunca engolir em silêncio, nunca mostrar mensagem genérica.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { rawMessage } from "@/lib/format-error";

type Props = { children: ReactNode; titulo?: string; onErro?: (mensagem: string) => void };
type Estado = { erro: unknown };

export class BlocoErroBoundary extends Component<Props, Estado> {
  state: Estado = { erro: null };

  static getDerivedStateFromError(erro: unknown): Estado {
    return { erro };
  }

  componentDidCatch(erro: unknown, info: ErrorInfo) {
    console.error("[BlocoErroBoundary]", erro, info?.componentStack);
    this.props.onErro?.(rawMessage(erro));
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 space-y-2">
        <p className="text-sm font-semibold flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          {this.props.titulo || "Este bloco falhou"}
        </p>
        <pre className="text-xs whitespace-pre-wrap break-words text-destructive/90">
          {rawMessage(this.state.erro)}
        </pre>
        <Button size="sm" variant="outline" onClick={() => this.setState({ erro: null })}>
          Tentar de novo
        </Button>
      </div>
    );
  }
}
