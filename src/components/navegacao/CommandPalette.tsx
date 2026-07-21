import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutGrid, Users, Monitor, Star, Search,
  FileText, Briefcase, UserPlus, ClipboardList, Workflow,
  BookOpen, MessageSquare, Settings, Sliders,
  Receipt, Calendar, Heart, Building2, ChevronRight,
  CreditCard, UserSearch,
  ShoppingCart, Truck, Store, DollarSign, Wallet, TrendingUp, GitCompare,
  FileSignature, Home, Shield, FolderArchive, Route, ListChecks,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useRecentes } from "@/hooks/useRecentes";
import { useFavoritos } from "@/hooks/useFavoritos";
import { supabase } from "@/integrations/supabase/client";

type Pilar = "sncf" | "people" | "ti" | "admin" | "financas" | "marca" | "credito" | "sops";

interface PageItem {
  rota: string;
  titulo: string;
  pilar: Pilar;
  icon: typeof LayoutGrid;
  tags: string[];
}

const ALL_PAGES: PageItem[] = [
  // SNCF
  { rota: "/sncf", titulo: "Portal Uauuu", pilar: "sncf", icon: LayoutGrid, tags: ["portal", "home", "início"] },
  { rota: "/tarefas", titulo: "Minhas Tarefas", pilar: "sncf", icon: ClipboardList, tags: ["tarefas", "pendências"] },
  { rota: "/tarefas/time", titulo: "Tarefas do Time", pilar: "sncf", icon: ClipboardList, tags: ["tarefas", "time", "equipe"] },
  { rota: "/processos", titulo: "Processos", pilar: "sncf", icon: Workflow, tags: ["processos", "mapeamento"] },
  { rota: "/documentacao", titulo: "Documentação", pilar: "sncf", icon: FileText, tags: ["docs", "documentação", "manual"] },
  { rota: "/fala-fetely", titulo: "Fala Fetely", pilar: "sncf", icon: MessageSquare, tags: ["fala", "chat", "ia", "perguntar"] },
  { rota: "/fala-fetely/conhecimento", titulo: "Base de Conhecimento", pilar: "sncf", icon: BookOpen, tags: ["conhecimento", "base"] },
  
  { rota: "/compras", titulo: "Compras", pilar: "sncf", icon: Receipt, tags: ["compras", "pedidos"] },
  { rota: "/credito", titulo: "Análise de Crédito", pilar: "credito", icon: CreditCard, tags: ["crédito", "análise", "limite"] },
  { rota: "/comercial/estoque-virtual", titulo: "Estoque Virtual", pilar: "sops", icon: LayoutGrid, tags: ["estoque", "virtual", "comercial", "produtos", "bling"] },

  // SOPs
  { rota: "/pedidos", titulo: "Pedidos", pilar: "sops", icon: ShoppingCart, tags: ["pedidos", "vendas", "ordens"] },
  { rota: "/logistica", titulo: "Logística", pilar: "sops", icon: Truck, tags: ["logística", "frete", "transportadora", "entrega"] },
  { rota: "/vendas/gestao-pedidos", titulo: "Gestão de Pedidos", pilar: "sops", icon: ListChecks, tags: ["gestão", "pedidos", "vendas"] },
  { rota: "/vendas/shopify", titulo: "Shopify B2C", pilar: "sops", icon: Store, tags: ["shopify", "b2c", "ecommerce", "loja"] },
  { rota: "/vendas/nfs", titulo: "NFs de Venda", pilar: "sops", icon: Receipt, tags: ["nfs", "notas", "fiscais", "venda"] },
  { rota: "/recebimento/cobranca", titulo: "Cobrança", pilar: "sops", icon: DollarSign, tags: ["cobrança", "recebimento", "inadimplência"] },

  // Finanças
  { rota: "/administrativo", titulo: "Dashboard Financeiro", pilar: "financas", icon: TrendingUp, tags: ["financeiro", "dashboard", "administrativo"] },
  { rota: "/administrativo/contas-pagar", titulo: "Contas a Pagar", pilar: "financas", icon: Wallet, tags: ["contas", "pagar", "despesas"] },
  { rota: "/administrativo/contas-receber", titulo: "Contas a Receber", pilar: "financas", icon: Wallet, tags: ["contas", "receber", "recebimento"] },
  { rota: "/administrativo/conciliacao", titulo: "Conciliação", pilar: "financas", icon: GitCompare, tags: ["conciliação", "extrato", "bancária"] },
  { rota: "/administrativo/fluxo-caixa", titulo: "Fluxo de Caixa", pilar: "financas", icon: TrendingUp, tags: ["fluxo", "caixa", "financeiro"] },

  // Marca
  { rota: "/administrativo-fetely/contratos", titulo: "Contratos", pilar: "marca", icon: FileSignature, tags: ["contratos", "jurídico", "documentos"] },
  { rota: "/administrativo-fetely/imoveis", titulo: "Imóveis", pilar: "marca", icon: Home, tags: ["imóveis", "aluguel", "propriedades"] },
  { rota: "/administrativo-fetely/seguros", titulo: "Seguros", pilar: "marca", icon: Shield, tags: ["seguros", "apólice"] },
  { rota: "/administrativo-fetely/ged", titulo: "GED", pilar: "marca", icon: FolderArchive, tags: ["ged", "documentos", "arquivo"] },

  // Crédito
  { rota: "/credito/clientes", titulo: "Clientes", pilar: "credito", icon: UserSearch, tags: ["clientes", "crédito", "parceiros"] },
  { rota: "/credito/regua-etapas", titulo: "Régua de Etapas", pilar: "credito", icon: Route, tags: ["régua", "etapas", "cobrança"] },
  { rota: "/credito/regras-cadencia", titulo: "Regras de Cadência", pilar: "credito", icon: ListChecks, tags: ["regras", "cadência", "cobrança"] },

  // People
  { rota: "/dashboard", titulo: "Dashboard People", pilar: "people", icon: Users, tags: ["dashboard", "rh", "resumo"] },
  { rota: "/pessoas", titulo: "Pessoas", pilar: "people", icon: Users, tags: ["pessoas", "colaboradores", "lista"] },
  { rota: "/recrutamento", titulo: "Recrutamento", pilar: "people", icon: UserPlus, tags: ["recrutamento", "vagas", "candidatos"] },
  { rota: "/convites-cadastro", titulo: "Convites de Cadastro", pilar: "people", icon: UserPlus, tags: ["convites", "cadastro"] },
  { rota: "/onboarding", titulo: "Onboarding", pilar: "people", icon: ClipboardList, tags: ["onboarding", "integração"] },
  { rota: "/movimentacoes", titulo: "Movimentações", pilar: "people", icon: ChevronRight, tags: ["movimentações", "transferências"] },
  { rota: "/folha-pagamento", titulo: "Folha de Pagamento", pilar: "people", icon: Receipt, tags: ["folha", "pagamento", "holerite"] },
  { rota: "/pagamentos-pj", titulo: "Pagamentos PJ", pilar: "people", icon: Receipt, tags: ["pagamentos", "pj"] },
  { rota: "/notas-fiscais", titulo: "Notas Fiscais PJ", pilar: "people", icon: Receipt, tags: ["notas", "fiscais", "nf"] },
  { rota: "/ferias", titulo: "Férias", pilar: "people", icon: Calendar, tags: ["férias", "descanso"] },
  { rota: "/beneficios", titulo: "Benefícios", pilar: "people", icon: Heart, tags: ["benefícios"] },
  { rota: "/organograma", titulo: "Organograma", pilar: "people", icon: Building2, tags: ["organograma", "estrutura"] },

  // TI
  { rota: "/ti", titulo: "Dashboard TI", pilar: "ti", icon: Monitor, tags: ["ti", "tecnologia", "dashboard"] },

  // Admin
  { rota: "/admin/cargos", titulo: "Cargos e Salários", pilar: "admin", icon: Briefcase, tags: ["cargos", "salários", "ppr"] },
  { rota: "/admin/parametros", titulo: "Parâmetros", pilar: "admin", icon: Sliders, tags: ["parâmetros", "configuração"] },
  { rota: "/admin/configuracoes", titulo: "Configurações", pilar: "admin", icon: Settings, tags: ["configurações", "sistema"] },
  { rota: "/admin/usuarios", titulo: "Gerenciar Usuários", pilar: "admin", icon: Users, tags: ["usuários", "acessos", "roles"] },
  { rota: "/admin/reportes", titulo: "Reportes do Sistema", pilar: "admin", icon: FileText, tags: ["reportes", "alertas"] },
  { rota: "/admin/importacoes-pdf", titulo: "Importações PDF", pilar: "admin", icon: FileText, tags: ["importações", "pdf", "ia"] },
];

const PILAR_COLORS: Record<string, string> = {
  sncf: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  people: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  ti: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  admin: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  financas: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20",
  marca: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
  credito: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20",
  sops: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
};

const PILAR_LABELS: Record<string, string> = {
  sncf: "SNCF",
  people: "People",
  ti: "TI",
  admin: "ADM",
  financas: "Finanças",
  marca: "Marca",
  credito: "Crédito",
  sops: "SOPs",
};

interface AnaliseRow {
  id: string;
  estagio_atual: string;
  status_final: string | null;
  parceiro_id: string;
  parceiro_nome: string;
  parceiro_cnpj: string | null;
}

interface ClienteRow {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ListItem =
  | { type: "header"; label: string }
  | { type: "item"; page: PageItem }
  | { type: "analise"; row: AnaliseRow }
  | { type: "cliente"; row: ClienteRow };

export function CommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { recentes } = useRecentes(5);
  const { favoritos, isFavorito, toggleFavorito } = useFavoritos();

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const queryTrimmed = query.trim();
  const enableEntidades = queryTrimmed.length >= 2;

  // Busca clientes (parceiros)
  const parceirosQuery = useQuery({
    queryKey: ["cmdk-parceiros", queryTrimmed],
    enabled: open && enableEntidades,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const term = queryTrimmed;
      const { data, error } = await supabase
        .from("parceiros_comerciais")
        .select("id, razao_social, nome_fantasia, cnpj")
        .or(`razao_social.ilike.%${term}%,nome_fantasia.ilike.%${term}%,cnpj.ilike.%${term}%`)
        .eq("ativo", true)
        .limit(6);
      if (error) throw error;
      return (data ?? []) as ClienteRow[];
    },
  });

  // Busca análises de crédito (via parceiro)
  const analisesQuery = useQuery({
    queryKey: ["cmdk-analises", queryTrimmed],
    enabled: open && enableEntidades,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const term = queryTrimmed;
      const { data, error } = await supabase
        .from("analises_credito")
        .select(`
          id,
          estagio_atual,
          status_final,
          parceiro_id,
          parceiros_comerciais!analises_credito_parceiro_id_fkey(razao_social, cnpj)
        `)
        .or(
          `razao_social.ilike.%${term}%,cnpj.ilike.%${term}%`,
          { foreignTable: "parceiros_comerciais" } as never
        )
        .limit(6);
      if (error) throw error;
      return (data ?? [])
        .filter((row: any) => row.parceiros_comerciais)
        .map((row: any) => ({
          id: row.id,
          estagio_atual: row.estagio_atual,
          status_final: row.status_final,
          parceiro_id: row.parceiro_id,
          parceiro_nome: row.parceiros_comerciais?.razao_social ?? "—",
          parceiro_cnpj: row.parceiros_comerciais?.cnpj ?? null,
        })) as AnaliseRow[];
    },
  });

  const filtered = useMemo(() => {
    if (!queryTrimmed) return [];
    const q = queryTrimmed.toLowerCase();
    return ALL_PAGES.filter(
      (p) =>
        p.titulo.toLowerCase().includes(q) ||
        p.tags.some((t) => t.includes(q)) ||
        p.pilar.includes(q)
    );
  }, [queryTrimmed]);

  const items = useMemo<ListItem[]>(() => {
    const result: ListItem[] = [];

    if (!queryTrimmed) {
      if (favoritos.length > 0) {
        result.push({ type: "header", label: "⭐ Favoritos" });
        favoritos.forEach((f) => {
          const page = ALL_PAGES.find((p) => p.rota === f.rota);
          if (page) result.push({ type: "item", page });
        });
      }
      if (recentes.length > 0) {
        const recentItems = recentes
          .map((r) => ALL_PAGES.find((p) => p.rota === r.rota))
          .filter((p): p is PageItem => !!p && !favoritos.some((f) => f.rota === p.rota));
        if (recentItems.length > 0) {
          result.push({ type: "header", label: "🕐 Recentes" });
          recentItems.forEach((page) => result.push({ type: "item", page }));
        }
      }
      if (result.filter((r) => r.type === "item").length === 0) {
        result.push({ type: "header", label: "📋 Todas as páginas" });
        ALL_PAGES.slice(0, 10).forEach((page) => result.push({ type: "item", page }));
      }
    } else {
      if (filtered.length > 0) {
        result.push({ type: "header", label: `🔍 Telas` });
        filtered.slice(0, 10).forEach((page) => result.push({ type: "item", page }));
      }
      if (analisesQuery.data && analisesQuery.data.length > 0) {
        result.push({ type: "header", label: "💳 Análises de crédito" });
        analisesQuery.data.forEach((row) => result.push({ type: "analise", row }));
      }
      if (parceirosQuery.data && parceirosQuery.data.length > 0) {
        result.push({ type: "header", label: "🏢 Clientes" });
        parceirosQuery.data.forEach((row) => result.push({ type: "cliente", row }));
      }
    }

    return result;
  }, [queryTrimmed, favoritos, recentes, filtered, analisesQuery.data, parceirosQuery.data]);

  const selectableItems = useMemo(
    () =>
      items.filter(
        (i): i is Exclude<ListItem, { type: "header" }> => i.type !== "header"
      ),
    [items]
  );

  const handleSelectItem = useCallback(
    (item: Exclude<ListItem, { type: "header" }>) => {
      if (item.type === "item") navigate(item.page.rota);
      else if (item.type === "analise") navigate(`/credito/analises/${item.row.id}`, { state: { from: location.pathname, fromLabel: "Busca" } });
      else if (item.type === "cliente") navigate(`/credito/clientes/${item.row.id}`, { state: { from: location.pathname, fromLabel: "Busca" } });
      onOpenChange(false);
    },
    [navigate, onOpenChange, location.pathname]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, selectableItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = selectableItems[selectedIndex];
        if (selected) handleSelectItem(selected);
      }
    },
    [selectableItems, selectedIndex, handleSelectItem]
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [queryTrimmed]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  let itemIndex = -1;
  const isLoadingEntidades =
    enableEntidades && (analisesQuery.isLoading || parceirosQuery.isLoading);
  const nothingFound =
    queryTrimmed &&
    filtered.length === 0 &&
    (!analisesQuery.data || analisesQuery.data.length === 0) &&
    (!parceirosQuery.data || parceirosQuery.data.length === 0) &&
    !isLoadingEntidades;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 max-w-2xl overflow-hidden gap-0">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar tela, cliente, análise..."
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
          <kbd className="rounded border px-1.5 py-0.5 text-[10px] font-mono bg-muted text-muted-foreground">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[440px] overflow-y-auto">
          {items.map((item, i) => {
            if (item.type === "header") {
              return (
                <div
                  key={`h-${i}`}
                  className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/30"
                >
                  {item.label}
                </div>
              );
            }

            itemIndex++;
            const isSelected = itemIndex === selectedIndex;
            const currentItemIndex = itemIndex;
            const selectableSnapshot = item;

            if (item.type === "item") {
              const page = item.page;
              const Icon = page.icon;
              const fav = isFavorito(page.rota);
              return (
                <button
                  key={`p-${page.rota}-${i}`}
                  data-index={currentItemIndex}
                  onMouseEnter={() => setSelectedIndex(currentItemIndex)}
                  onClick={() => handleSelectItem(selectableSnapshot)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    isSelected ? "bg-muted" : "hover:bg-muted/50"
                  }`}
                >
                  <div className={`shrink-0 h-8 w-8 rounded-lg flex items-center justify-center ${PILAR_COLORS[page.pilar]}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="flex-1 text-sm font-medium truncate">{page.titulo}</span>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${PILAR_COLORS[page.pilar]}`}>
                    {PILAR_LABELS[page.pilar] || page.pilar}
                  </Badge>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggleFavorito(page.rota, page.titulo, page.pilar);
                    }}
                    className={`shrink-0 p-1 rounded hover:bg-background/80 ${
                      fav ? "text-amber-400" : "text-muted-foreground/20 hover:text-amber-400"
                    }`}
                    aria-label={fav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                  >
                    <Star className={`h-3.5 w-3.5 ${fav ? "fill-amber-400" : ""}`} />
                  </button>
                </button>
              );
            }

            if (item.type === "analise") {
              const a = item.row;
              return (
                <button
                  key={`a-${a.id}`}
                  data-index={currentItemIndex}
                  onMouseEnter={() => setSelectedIndex(currentItemIndex)}
                  onClick={() => handleSelectItem(selectableSnapshot)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    isSelected ? "bg-muted" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center bg-gold/10 text-gold border border-gold/20">
                    <CreditCard className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.parceiro_nome}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {a.parceiro_cnpj ?? "sem CNPJ"} · {a.status_final ?? a.estagio_atual}
                    </p>
                  </div>
                </button>
              );
            }

            // cliente
            const c = item.row;
            return (
              <button
                key={`c-${c.id}`}
                data-index={currentItemIndex}
                onMouseEnter={() => setSelectedIndex(currentItemIndex)}
                onClick={() => handleSelectItem(selectableSnapshot)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  isSelected ? "bg-muted" : "hover:bg-muted/50"
                }`}
              >
                <div className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center bg-gold/10 text-gold border border-gold/20">
                  <UserSearch className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.razao_social}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[c.nome_fantasia, c.cnpj].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
              </button>
            );
          })}

          {isLoadingEntidades && (
            <div className="px-4 py-3 text-xs text-muted-foreground">
              Buscando análises e clientes…
            </div>
          )}

          {nothingFound && (
            <div className="text-center py-12 px-4">
              <p className="text-sm text-muted-foreground">
                Nada encontrado para "{queryTrimmed}".
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Tente "tarefas", "pessoas", CNPJ ou nome do cliente…
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 px-4 py-2 border-t bg-muted/20 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="rounded border px-1 py-0.5 font-mono bg-background">↑↓</kbd>
            navegar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border px-1 py-0.5 font-mono bg-background">↵</kbd>
            abrir
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border px-1 py-0.5 font-mono bg-background">esc</kbd>
            fechar
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
