import { Wallet, AlertTriangle } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { FinancasSidebarItem } from "./FinancasSidebarItem";
import { FinancasSidebarSection } from "./FinancasSidebarSection";
import { useSidebarApp, type BlocoSidebar } from "@/hooks/useSidebarApp";
import { iconeDe } from "@/lib/iconesNavegacao";

/**
 * Estrutura vem da sncf_navegacao (app 'financas'), não de JSX literal.
 * Para mover, renomear ou reordenar item: UPDATE em sncf_navegacao.
 * Cache de 5 min — recarregar a página traz a mudança na hora.
 */
export function FinancasContextSidebar() {
  const { blocos, isLoading, isError, refetch } = useSidebarApp("financas");

  const itensDo = (b: BlocoSidebar) =>
    b.itens.map((i) => (
      <FinancasSidebarItem
        key={i.chave}
        to={i.rota}
        icon={iconeDe(i.icone)}
        label={i.label}
        end={i.exato}
      />
    ));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Wallet className="h-5 w-5 text-gold flex-shrink-0" />
          <span className="font-serif text-lg text-foreground group-data-[collapsible=icon]:hidden">
            Finanças
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="pt-4 gap-0">
        {isLoading && (
          <div className="px-3 py-2 space-y-2 group-data-[collapsible=icon]:hidden">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-7 rounded bg-muted/50 animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <div className="px-3 py-4 group-data-[collapsible=icon]:hidden">
            <div className="flex items-start gap-2 text-xs text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Menu indisponível</p>
                <p className="text-muted-foreground mt-0.5">
                  Não foi possível carregar a estrutura do menu.
                </p>
                <button
                  onClick={() => refetch()}
                  className="mt-2 underline underline-offset-2"
                >
                  Tentar de novo
                </button>
              </div>
            </div>
          </div>
        )}

        {blocos.map((b, idx) => {
          // Bloco sem rótulo: itens direto no app, renderizam sem cabeçalho.
          if (!b.label) {
            return (
              <SidebarGroup
                key={b.chave}
                className={idx === 0 ? "pb-3" : "border-t border-gold/10 py-3"}
              >
                <SidebarGroupContent>
                  <SidebarMenu>{itensDo(b)}</SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          }

          // Primeiro bloco com rótulo: rótulo simples, sem borda e sem colapsar.
          if (idx === 0) {
            return (
              <SidebarGroup key={b.chave} className="pb-3">
                <SidebarGroupLabel className="px-3 py-2 text-[11px] uppercase tracking-[2px] text-muted-foreground h-auto">
                  {b.label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>{itensDo(b)}</SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          }

          return (
            <SidebarGroup key={b.chave} className="border-t border-gold/10 py-3">
              <SidebarGroupContent>
                <FinancasSidebarSection title={b.label} variant="primary">
                  {itensDo(b)}
                </FinancasSidebarSection>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}
