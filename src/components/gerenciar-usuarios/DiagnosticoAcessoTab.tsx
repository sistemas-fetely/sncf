import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ScanSearch, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type DiagRow = {
  id: string;
  slug: string;
  tipo: string | null;
  pilar: string | null;
  nome_exibicao: string | null;
  ativo: boolean | null;
  n_grupos: number | null;
  n_pessoas: number | null;
  n_pessoas_nao_sa: number | null;
  rotas_cabeadas: number | null;
  rotas_alcancaveis: number | null;
  diagnostico: string | null;
};

const DIAG_META: Record<string, { label: string; className: string; tooltip?: string }> = {
  ok: { label: "Saudável", className: "bg-success/10 text-success border-success/30" },
  reserva_de_pilar: {
    label: "Reserva",
    className: "bg-muted text-muted-foreground",
    tooltip: "Existe para uso futuro, sem concessão e sem rota — normal.",
  },
  pronta_e_nunca_concedida: {
    label: "Pronta e órfã",
    className: "bg-warning/10 text-warning border-warning/30",
    tooltip: "Tela pronta que nenhum grupo concede — funcionalidade morrendo em silêncio.",
  },
  nunca_concedida: { label: "Nunca concedida", className: "bg-muted text-muted-foreground" },
  concedida_grupo_vazio: {
    label: "Grupo vazio",
    className: "bg-warning/10 text-warning border-warning/30",
    tooltip: "Concedida a grupo sem pessoas.",
  },
  concedida_inalcancavel: {
    label: "Sem rota alcançável",
    className: "bg-warning/10 text-warning border-warning/30",
    tooltip: "Concessão existe mas nenhuma rota pronta e não-restrita usa este slug.",
  },
  alcanca_so_super_admin: {
    label: "Só super admins",
    className: "bg-info/10 text-info border-info/30",
    tooltip: "Formalmente concedida, mas hoje só alcança quem já tem bypass.",
  },
  inativa: { label: "Inativa", className: "bg-muted text-muted-foreground" },
};

function DiagBadge({ diag }: { diag: string | null }) {
  const meta = (diag && DIAG_META[diag]) || {
    label: diag ?? "—",
    className: "bg-muted text-muted-foreground",
  };
  const badge = (
    <Badge variant="outline" className={cn("font-medium", meta.className)}>
      {meta.label}
    </Badge>
  );
  if (!("tooltip" in meta) || !meta.tooltip) return badge;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help">{badge}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{meta.tooltip}</TooltipContent>
    </Tooltip>
  );
}

function MatrizConcessao() {
  const [open, setOpen] = useState(false);

  const gruposQ = useQuery({
    queryKey: ["diag-grupos-ativos"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grupos_acesso")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) {
        toast.error("Erro ao carregar grupos de acesso: " + error.message);
        throw error;
      }
      return data ?? [];
    },
  });

  const concessoesQ = useQuery({
    queryKey: ["diag-concessoes"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grupo_acesso_permissoes")
        .select("grupo_acesso_id, permissao_id, permissoes_catalogo!inner(slug, nome_exibicao, tipo, pilar)")
        .eq("pode_ver", true);
      if (error) {
        toast.error("Erro ao carregar concessões: " + error.message);
        throw error;
      }
      return (data ?? []) as unknown as Array<{
        grupo_acesso_id: string;
        permissao_id: string;
        permissoes_catalogo: {
          slug: string;
          nome_exibicao: string | null;
          tipo: string | null;
          pilar: string | null;
        };
      }>;
    },
  });

  const grupos = gruposQ.data ?? [];
  const linhas = useMemo(() => {
    const map = new Map<
      string,
      { slug: string; nome: string; tipo: string | null; pilar: string; grupos: Set<string> }
    >();
    for (const c of concessoesQ.data ?? []) {
      const p = c.permissoes_catalogo;
      if (!p) continue;
      let row = map.get(c.permissao_id);
      if (!row) {
        row = {
          slug: p.slug,
          nome: p.nome_exibicao ?? p.slug,
          tipo: p.tipo,
          pilar: p.pilar ?? "Sem pilar",
          grupos: new Set(),
        };
        map.set(c.permissao_id, row);
      }
      row.grupos.add(c.grupo_acesso_id);
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => a.pilar.localeCompare(b.pilar) || a.nome.localeCompare(b.nome));
    return arr;
  }, [concessoesQ.data]);

  const carregando = gruposQ.isLoading || concessoesQ.isLoading;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">Matriz de concessão</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Para editar concessões use a aba Grupos de Acesso.
              </p>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
                {open ? "Ocultar" : "Mostrar"}
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="overflow-x-auto">
            {carregando ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando matriz…
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[260px]">Permissão</TableHead>
                    {grupos.map((g) => (
                      <TableHead key={g.id} className="text-center whitespace-nowrap">
                        {g.nome}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l, i) => {
                    const novoPilar = i === 0 || linhas[i - 1].pilar !== l.pilar;
                    return (
                      <>
                        {novoPilar && (
                          <TableRow key={`pilar-${l.pilar}`} className="bg-muted/50">
                            <TableCell
                              colSpan={grupos.length + 1}
                              className="text-xs font-semibold uppercase tracking-wide"
                            >
                              {l.pilar}
                            </TableCell>
                          </TableRow>
                        )}
                        <TableRow key={l.slug}>
                          <TableCell>
                            <div className="font-medium text-sm">{l.nome}</div>
                            <div className="text-xs text-muted-foreground font-mono">{l.slug}</div>
                          </TableCell>
                          {grupos.map((g) => (
                            <TableCell key={g.id} className="text-center">
                              {l.grupos.has(g.id) ? (
                                <span className="text-success font-bold">✓</span>
                              ) : (
                                <span className="text-muted-foreground/40">·</span>
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      </>
                    );
                  })}
                  {linhas.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={grupos.length + 1} className="text-center text-muted-foreground py-6">
                        Nenhuma concessão de leitura encontrada.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function DiagnosticoAcessoTab() {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<string>("todos");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["permissao-diagnostico"],
    queryFn: async (): Promise<DiagRow[]> => {
      const { data, error } = await supabase
        .from("vw_permissao_diagnostico")
        .select(
          "id, slug, tipo, pilar, nome_exibicao, ativo, n_grupos, n_pessoas, n_pessoas_nao_sa, rotas_cabeadas, rotas_alcancaveis, diagnostico",
        )
        .order("pilar")
        .order("slug");
      if (error) {
        toast.error("Erro ao carregar diagnóstico de permissões: " + error.message);
        throw error;
      }
      return (data ?? []) as unknown as DiagRow[];
    },
  });

  const rows = data ?? [];

  const resumo = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = r.diagnostico ?? "desconhecido";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter((r) => {
      if (filtro !== "todos" && (r.diagnostico ?? "") !== filtro) return false;
      if (!q) return true;
      return (
        r.slug.toLowerCase().includes(q) || (r.nome_exibicao ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, busca, filtro]);

  if (isError) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="p-6 text-sm text-destructive">
          Falha ao carregar o diagnóstico: {(error as Error)?.message}
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ScanSearch className="h-4 w-4" />
          Raio-X somente leitura das permissões: quem concede, quem alcança e o que está órfão.
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando diagnóstico…
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {resumo.map(([diag, count]) => {
                const meta = DIAG_META[diag];
                const ativo = filtro === diag;
                return (
                  <button
                    key={diag}
                    type="button"
                    onClick={() => setFiltro(ativo ? "todos" : diag)}
                    className={cn(
                      "text-left rounded-lg border p-4 transition-colors hover:bg-accent/50",
                      ativo && "ring-2 ring-primary",
                    )}
                  >
                    <p className="text-2xl font-bold">{count}</p>
                    <div className="mt-1">
                      <DiagBadge diag={diag} />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                placeholder="Buscar por slug ou nome…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="sm:max-w-xs"
              />
              <Select value={filtro} onValueChange={setFiltro}>
                <SelectTrigger className="sm:w-64">
                  <SelectValue placeholder="Diagnóstico" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os diagnósticos</SelectItem>
                  {resumo.map(([diag]) => (
                    <SelectItem key={diag} value={diag}>
                      {DIAG_META[diag]?.label ?? diag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground sm:ml-auto">
                {filtradas.length} de {rows.length} permissões
              </span>
            </div>

            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[260px]">Permissão</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Pilar</TableHead>
                      <TableHead className="text-right">Grupos</TableHead>
                      <TableHead>Pessoas</TableHead>
                      <TableHead className="text-center">Rotas</TableHead>
                      <TableHead>Diagnóstico</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtradas.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="font-medium text-sm">{r.nome_exibicao ?? r.slug}</div>
                          <div className="text-xs text-muted-foreground font-mono">{r.slug}</div>
                        </TableCell>
                        <TableCell className="text-sm">{r.tipo ?? "—"}</TableCell>
                        <TableCell className="text-sm">{r.pilar ?? "—"}</TableCell>
                        <TableCell className="text-right text-sm">{r.n_grupos ?? 0}</TableCell>
                        <TableCell className="text-sm">
                          {r.n_pessoas ?? 0}
                          <span className="text-xs text-muted-foreground">
                            {" "}
                            (das quais {r.n_pessoas_nao_sa ?? 0} não-admin)
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          {r.rotas_alcancaveis ?? 0}/{r.rotas_cabeadas ?? 0}
                        </TableCell>
                        <TableCell>
                          <DiagBadge diag={r.diagnostico} />
                        </TableCell>
                      </TableRow>
                    ))}
                    {filtradas.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          Nenhuma permissão encontrada com os filtros atuais.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <MatrizConcessao />
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
