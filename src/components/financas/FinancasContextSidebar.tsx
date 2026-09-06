import { Wallet, AlertTriangle } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { FinancasSidebarItem } from "./FinancasSidebarItem";
import { FinancasSidebarSection } from "./FinancasSidebarSection";
import { AtalhosFixos } from "@/components/navegacao/AtalhosFixos";
import { useMenuApp, type ItemMenu } from "@/hooks/useMenuApp";
import { resolverIcone } from "@/config/iconesNavegacao";

/**
 * Sidebar de Finanças — MENU-VIA-TABELA.
 *
 * Estrutura vem da sncf_navegacao (app 'financas'), não de JSX literal.
 * Para mover, renomear ou reordenar item: UPDATE em sncf_navegacao.
 *
 * Migrada em 22/08/2026 de `useSidebarApp` para `useMenuApp`, fechando a
 * última sidebar viva fora do padrão. O hook antigo reimplementava a
 * precedência de autorização por conta própria — duas implementações de
 * autorização, contra a doutrina de que menu e portão leem a mesma linha.
 * Também usava um segundo mapa de ícones (`lib/iconesNavegacao`), que não
 * conhecia `Zap` e já caía em ícone genérico silenciosamente.
 *
 * O `exato` de cada item agora vem derivado do próprio hook.
 */
export function FinancasContextSidebar() {
  const { grupos, soltos, isLoading, isError, refetch } = useMenuApp("financas");

  const renderItem = (i: ItemMenu) => (
    <FinancasSidebarItem
      key={i.chave}
      to={i.rota}
      icon={resolverIcone(i.icone)}
      label={i.label}
      end={i.exato}
    />
  );

  // Itens pendurados direto no app (sem grupo) vêm primeiro, sem cabeçalho.
  const blocos: Array<{ chave: string; label: string | null; itens: ItemMenu[] }> = [
    ...(soltos.length ? [{ chave: "financas::soltos", label: null, itens: soltos }] : []),
    ...grupos.map((g) => ({ chave: g.chave, label: g.label, itens: g.itens })),
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-1">
          <Wallet className="h-5 w-5 text-gold flex-shrink-0 group-data-[collapsible=icon]:hidden" />
          <span className="font-serif text-lg text-foreground group-data-[collapsible=icon]:hidden">
            Finanças
          </span>
          <SidebarTrigger className="ml-auto h-7 w-7 text-sidebar-muted hover:text-sidebar-foreground group-data-[collapsible=icon]:ml-0" />
        </div>
      </SidebarHeader>

      <SidebarContent className="pt-4 gap-0">
        <AtalhosFixos />
        <div className="mx-4 border-t border-sidebar-border/40" />

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
                  <SidebarMenu>{b.itens.map(renderItem)}</SidebarMenu>
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
                  <SidebarMenu>{b.itens.map(renderItem)}</SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          }

          return (
            <SidebarGroup key={b.chave} className="border-t border-gold/10 py-3">
              <SidebarGroupContent>
                <FinancasSidebarSection title={b.label} variant="primary">
                  {b.itens.map(renderItem)}
                </FinancasSidebarSection>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}
