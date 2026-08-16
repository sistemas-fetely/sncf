/**
 * LayoutHeader — Cabeçalho padrão dos layouts dos sistemas.
 *
 * Doutrina cravada na Sprint 2 (29/04/2026):
 * "Em TODA tela de qualquer sistema (exceto Portal), o cabeçalho fixo tem:
 *  ← Voltar ao Portal | Ícone do sistema | Nome do sistema"
 *
 * SNCFLayout (Portal) não usa este componente — é a casa, não tem pra onde
 * voltar. Tem header próprio mais simples.
 *
 * Reusa: AdminLayout, TILayout, AdminFinanceiroLayout (Financeiro Fetely),
 * AppLayout (People), AdministrativoLayout (novo), GestaoVistaLayout (novo),
 * ProdutoLayout (novo).
 */

import { Home } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { RecentesEFavoritos } from "@/components/navegacao/RecentesEFavoritos";
import { ReportarErroBotao } from "@/components/shared/ReportarErroBotao";

export interface LayoutHeaderProps {
  /** Ícone do sistema (ex: Shield para ADM SNCF, Wallet para Financeiro) */
  icon: LucideIcon;
  /** Nome do sistema exibido no cabeçalho (ex: "ADM SNCF", "Financeiro Fetely") */
  nome: string;
  /** Cor do ícone (opcional, default = muted-foreground) */
  iconColor?: string;
}

export function LayoutHeader({ icon: Icon, nome, iconColor }: LayoutHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="h-14 flex items-center gap-3 border-b px-4 bg-card">
      <SidebarTrigger />

      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/sncf")}
        className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <Home className="h-3.5 w-3.5" />
        Voltar ao Portal
      </Button>

      <span className="text-muted-foreground/40">|</span>

      <Icon
        className="h-4 w-4 text-muted-foreground"
        style={iconColor ? { color: iconColor } : undefined}
      />
      <h1 className="text-sm font-medium">{nome}</h1>

      <div className="ml-auto flex items-center gap-1">
        <RecentesEFavoritos />
        <ReportarErroBotao />
      </div>
    </header>
  );
}
