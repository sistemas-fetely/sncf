import { ReactNode } from "react";

interface Props {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

/**
 * Layout para todas as páginas públicas de autenticação (login, recuperar, reset).
 * Identidade Fetely: creme de fundo, card branco, "Fetély." como marca d'água.
 */
export function FetelyAuthLayout({ children, title, subtitle }: Props) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F0E8] p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo Fetely */}
        <div className="text-center">
          <h1
            className="text-5xl font-medium tracking-tight"
            style={{ color: "#1a3d2b", fontFamily: "Georgia, serif" }}
          >
            Fetély.
          </h1>
          <p className="text-xs text-muted-foreground mt-2 tracking-wider">
            #celebreoqueimporta
          </p>
        </div>

        {/* Cabeçalho da tela */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-medium" style={{ color: "#1a3d2b" }}>
            {title}
          </h2>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>

        {/* Conteúdo (card branco) */}
        <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
          {children}
        </div>

        {/* Rodapé */}
        <p className="text-center text-xs text-muted-foreground">
          Fetély · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
