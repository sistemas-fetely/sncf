import { SidebarTrigger } from "@/components/ui/sidebar";

/**
 * MobileSidebarTrigger — botão de abrir o menu lateral em celular.
 *
 * O SidebarTrigger original mora dentro do próprio Sidebar; no mobile o Sidebar
 * vira um Sheet off-canvas, então o botão some junto quando o menu está fechado.
 * Este componente fica FORA do Sidebar, no topo da área de conteúdo, e só
 * aparece em viewport pequena (md:hidden).
 */
export function MobileSidebarTrigger() {
  return (
    <div className="sticky top-16 z-30 flex items-center gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur md:hidden">
      <SidebarTrigger className="h-8 w-8 shrink-0" />
      <span className="text-sm font-medium text-muted-foreground">Menu</span>
    </div>
  );
}
