import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Network,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Plus,
  Pencil,
  MoveRight,
  Link2,
  Users,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  PermissaoTelaProvider,
  usePermissaoTelaContext,
  AvisoSomenteLeitura,
} from "@/contexts/PermissaoTelaContext";

// MAPA DA OPERACAO — arvore Cadeira -> Macro-processo -> Processo.
// Leitura vem de vw_mapa_operacao / vw_mapa_lacunas; escrita SO por RPC
// (mapa_salvar_macro, mapa_mover_processo, mapa_ligar_fila, mapa_ligar_item).
// As RPCs exigem nivel 4+ no banco: erro 42501 vira toast com a mensagem do Postgres.

const SO_LEITURA = "Você tem acesso somente leitura nesta tela";

interface LinhaMapa {
  cadeira_id: string | null;
  cadeira: string | null;
  cadeira_ordem: number | null;
  macro_id: string | null;
  macro_codigo: string | null;
  macro: string | null;
  macro_ordem: number | null;
  macro_ativo: boolean | null;
  processo_id: string | null;
  processo_codigo: string | null;
  processo: string | null;
  processo_status: string | null;
  abrangencia: string | null;
  passos: number | null;
  itens_catalogo: number | null;
  filas: number | null;
  templates: number | null;
  atribuicoes: number | null;
  owner_nome: string | null;
  cadeira_responde: string | null;
}

interface Lacuna {
  lacuna: string;
  descricao: string | null;
  onde: string | null;
  detalhe: string | null;
  gravidade: number | null;
}

interface MacroNo {
  id: string;
  nome: string;
  codigo: string | null;
  ordem: number | null;
  ativo: boolean | null;
  cadeira_id: string | null;
  cadeira: string | null;
  processos: LinhaMapa[];
}

interface CadeiraNo {
  id: string;
  nome: string;
  ordem: number | null;
  macros: MacroNo[];
}

type Selecionado =
  | { tipo: "cadeira"; id: string }
  | { tipo: "macro"; id: string }
  | { tipo: "processo"; id: string }
  | null;

const KEYS = {
  mapa: ["vw_mapa_operacao"] as const,
  lacunas: ["vw_mapa_lacunas"] as const,
  macros: ["macro_processo", "mapa"] as const,
  cadeiras: ["departamentos", "mapa"] as const,
  passos: (id: string) => ["processo_passo", id] as const,
  itens: (id: string) => ["demanda_assunto", "processo", id] as const,
  filas: (id: string) => ["tarefas_filas", "processo", id] as const,
  itensLivres: ["demanda_assunto", "livres"] as const,
  filasLivres: ["tarefas_filas", "livres"] as const,
};

function ErroQuery({ o_que, erro }: { o_que: string; erro: unknown }) {
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription>
        Não foi possível carregar {o_que}. {formatError(erro)}
      </AlertDescription>
    </Alert>
  );
}

function useMapa() {
  return useQuery({
    queryKey: KEYS.mapa,
    queryFn: async (): Promise<LinhaMapa[]> => {
      const { data, error } = await (supabase as any).from("vw_mapa_operacao").select("*");
      if (error) throw error;
      return (data ?? []) as LinhaMapa[];
    },
  });
}

function useLacunas() {
  return useQuery({
    queryKey: KEYS.lacunas,
    queryFn: async (): Promise<Lacuna[]> => {
      const { data, error } = await (supabase as any).from("vw_mapa_lacunas").select("*");
      if (error) throw error;
      return (data ?? []) as Lacuna[];
    },
  });
}

function agrupar(linhas: LinhaMapa[]): CadeiraNo[] {
  const cadeiras = new Map<string, CadeiraNo>();
  const macros = new Map<string, MacroNo>();

  for (const l of linhas) {
    const cid = l.cadeira_id ?? "sem-cadeira";
    if (!cadeiras.has(cid)) {
      cadeiras.set(cid, {
        id: cid,
        nome: l.cadeira ?? "Sem cadeira",
        ordem: l.cadeira_ordem,
        macros: [],
      });
    }
    if (!l.macro_id) continue;

    let m = macros.get(l.macro_id);
    if (!m) {
      m = {
        id: l.macro_id,
        nome: l.macro ?? "(sem nome)",
        codigo: l.macro_codigo,
        ordem: l.macro_ordem,
        ativo: l.macro_ativo,
        cadeira_id: l.cadeira_id,
        cadeira: l.cadeira,
        processos: [],
      };
      macros.set(l.macro_id, m);
      cadeiras.get(cid)!.macros.push(m);
    }
    if (l.processo_id) m.processos.push(l);
  }

  const arr = [...cadeiras.values()];
  arr.sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999) || a.nome.localeCompare(b.nome));
  for (const c of arr) {
    c.macros.sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999) || a.nome.localeCompare(b.nome));
    for (const m of c.macros) {
      m.processos.sort((a, b) => (a.processo ?? "").localeCompare(b.processo ?? ""));
    }
  }
  return arr;
}

const STATUS_ROTULO: Record<string, string> = {
  vigente: "vigente",
  rascunho: "rascunho",
  em_revisao: "em revisão",
};

export default function MapaOperacao() {
  return (
    <PermissaoTelaProvider slug="tela.mapa_operacao">
      <MapaOperacaoConteudo />
    </PermissaoTelaProvider>
  );
}

function MapaOperacaoConteudo() {
  const qc = useQueryClient();
  const { podeEditar } = usePermissaoTelaContext();

  const mapa = useMapa();
  const lacunas = useLacunas();

  const [selecionado, setSelecionado] = useState<Selecionado>(null);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [lacunaAberta, setLacunaAberta] = useState<string | null>(null);

  const arvore = useMemo(() => agrupar(mapa.data ?? []), [mapa.data]);

  const invalidarTudo = () => {
    qc.invalidateQueries({ queryKey: KEYS.mapa });
    qc.invalidateQueries({ queryKey: KEYS.lacunas });
    qc.invalidateQueries({ queryKey: KEYS.macros });
  };

  // ---------- dialogs ----------
  const [macroDialog, setMacroDialog] = useState<MacroNo | "novo" | null>(null);
  const [moverDialog, setMoverDialog] = useState<LinhaMapa | null>(null);

  const grupos = useMemo(() => {
    const linhas = mapa.data ?? [];
    const vistos = new Map<string, { id: string; nome: string; cadeira: string }>();
    for (const l of linhas) {
      if (l.macro_id && !vistos.has(l.macro_id)) {
        vistos.set(l.macro_id, {
          id: l.macro_id,
          nome: l.macro ?? "(sem nome)",
          cadeira: l.cadeira ?? "Sem cadeira",
        });
      }
    }
    const porCadeira = new Map<string, { id: string; nome: string }[]>();
    for (const m of vistos.values()) {
      if (!porCadeira.has(m.cadeira)) porCadeira.set(m.cadeira, []);
      porCadeira.get(m.cadeira)!.push({ id: m.id, nome: m.nome });
    }
    return [...porCadeira.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [mapa.data]);

  const processoSel = useMemo(() => {
    if (selecionado?.tipo !== "processo") return null;
    return (mapa.data ?? []).find((l) => l.processo_id === selecionado.id) ?? null;
  }, [selecionado, mapa.data]);

  const cadeiraSel = useMemo(() => {
    if (selecionado?.tipo !== "cadeira") return null;
    return arvore.find((c) => c.id === selecionado.id) ?? null;
  }, [selecionado, arvore]);

  const macroSel = useMemo(() => {
    if (selecionado?.tipo !== "macro") return null;
    for (const c of arvore) {
      const m = c.macros.find((x) => x.id === selecionado.id);
      if (m) return m;
    }
    return null;
  }, [selecionado, arvore]);

  // ---------- lacunas agrupadas ----------
  const lacunasPorTipo = useMemo(() => {
    const mapaL = new Map<string, { descricao: string | null; gravidade: number | null; itens: Lacuna[] }>();
    for (const l of lacunas.data ?? []) {
      if (!mapaL.has(l.lacuna)) {
        mapaL.set(l.lacuna, { descricao: l.descricao, gravidade: l.gravidade, itens: [] });
      }
      mapaL.get(l.lacuna)!.itens.push(l);
    }
    return [...mapaL.entries()].sort(
      (a, b) => (a[1].gravidade ?? 9) - (b[1].gravidade ?? 9) || b[1].itens.length - a[1].itens.length
    );
  }, [lacunas.data]);

  return (
    <TooltipProvider>
      <PageShell>
        <PageHeader
          titulo="Mapa da Operação"
          icone={Network}
          estado="Cadeira · macro-processo · processo — a árvore é reorganizável aqui mesmo"
          acoes={
            podeEditar ? (
              <Button size="sm" onClick={() => setMacroDialog("novo")}>
                <Plus className="mr-1.5 h-4 w-4" />
                Novo macro-processo
              </Button>
            ) : undefined
          }
        />

        {!podeEditar && <AvisoSomenteLeitura />}

        {/* ---------- LACUNAS ---------- */}
        {lacunas.isError ? (
          <ErroQuery o_que="as lacunas do mapa" erro={lacunas.error} />
        ) : lacunas.isLoading ? (
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-48" />
            ))}
          </div>
        ) : lacunasPorTipo.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma lacuna apontada pelo mapa.</p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {lacunasPorTipo.map(([codigo, info]) => {
                const alta = info.gravidade === 1;
                const ativo = lacunaAberta === codigo;
                return (
                  <button
                    key={codigo}
                    type="button"
                    onClick={() => setLacunaAberta(ativo ? null : codigo)}
                    className={`min-w-[180px] rounded-lg border p-3 text-left transition-colors ${
                      alta
                        ? "border-destructive/60 bg-destructive/5 hover:bg-destructive/10"
                        : "border-border bg-card hover:bg-muted/50"
                    } ${ativo ? "ring-2 ring-ring" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-semibold">{info.itens.length}</span>
                      {alta && <AlertTriangle className="h-4 w-4 text-destructive" />}
                    </div>
                    <p className="text-sm font-medium">{info.descricao ?? codigo}</p>
                    <p className="text-xs text-muted-foreground">{codigo}</p>
                  </button>
                );
              })}
            </div>
            {lacunaAberta && (
              <Card>
                <CardContent className="space-y-1 py-3">
                  {(lacunasPorTipo.find(([c]) => c === lacunaAberta)?.[1].itens ?? []).map((l, i) => (
                    <div key={i} className="flex flex-wrap gap-2 border-b border-border/60 py-1 text-sm last:border-0">
                      <span className="font-medium">{l.onde ?? "—"}</span>
                      <span className="text-muted-foreground">{l.detalhe ?? ""}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ---------- ARVORE + PAINEL ---------- */}
        {mapa.isError ? (
          <ErroQuery o_que="a árvore da operação" erro={mapa.error} />
        ) : mapa.isLoading ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Árvore da operação</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {arvore.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma cadeira mapeada.</p>
                ) : (
                  arvore.map((c) => {
                    const abertoC = abertos[`c:${c.id}`] ?? true;
                    const totalProc = c.macros.reduce((s, m) => s + m.processos.length, 0);
                    return (
                      <div key={c.id}>
                        <div
                          className={`flex items-center gap-1 rounded-md px-1 py-1 ${
                            selecionado?.tipo === "cadeira" && selecionado.id === c.id ? "bg-muted" : ""
                          }`}
                        >
                          <button
                            type="button"
                            aria-label={abertoC ? "Recolher" : "Expandir"}
                            onClick={() => setAbertos((s) => ({ ...s, [`c:${c.id}`]: !abertoC }))}
                            className="text-muted-foreground"
                          >
                            {abertoC ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelecionado({ tipo: "cadeira", id: c.id })}
                            className="flex-1 truncate text-left text-sm font-medium"
                          >
                            {c.nome}
                          </button>
                          <span className="text-xs text-muted-foreground">
                            {c.macros.length} macro · {totalProc} proc
                          </span>
                        </div>

                        {abertoC &&
                          c.macros.map((m) => {
                            const abertoM = abertos[`m:${m.id}`] ?? true;
                            return (
                              <div key={m.id} className="ml-4">
                                <div
                                  className={`flex items-center gap-1 rounded-md px-1 py-1 ${
                                    selecionado?.tipo === "macro" && selecionado.id === m.id ? "bg-muted" : ""
                                  }`}
                                >
                                  <button
                                    type="button"
                                    aria-label={abertoM ? "Recolher" : "Expandir"}
                                    onClick={() => setAbertos((s) => ({ ...s, [`m:${m.id}`]: !abertoM }))}
                                    className="text-muted-foreground"
                                  >
                                    {abertoM ? (
                                      <ChevronDown className="h-4 w-4" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSelecionado({ tipo: "macro", id: m.id })}
                                    className="flex-1 truncate text-left text-sm"
                                  >
                                    {m.nome}
                                    {m.ativo === false && (
                                      <Badge variant="outline" className="ml-2 text-[10px]">
                                        inativo
                                      </Badge>
                                    )}
                                  </button>
                                  <span className="text-xs text-muted-foreground">{m.processos.length}</span>
                                  <AcaoEditar podeEditar={podeEditar} onClick={() => setMacroDialog(m)} />
                                </div>

                                {abertoM &&
                                  (m.processos.length === 0 ? (
                                    <p className="ml-9 py-1 text-xs text-muted-foreground">
                                      nenhum processo neste macro
                                    </p>
                                  ) : (
                                    m.processos.map((p) => (
                                      <div
                                        key={p.processo_id}
                                        className={`ml-5 flex items-center gap-2 rounded-md px-1 py-1 ${
                                          selecionado?.tipo === "processo" && selecionado.id === p.processo_id
                                            ? "bg-muted"
                                            : ""
                                        }`}
                                      >
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setSelecionado({ tipo: "processo", id: p.processo_id! })
                                          }
                                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                        >
                                          <span className="truncate text-sm">{p.processo}</span>
                                          {(p.passos ?? 0) === 0 && (
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                                              </TooltipTrigger>
                                              <TooltipContent>Processo sem passo mapeado</TooltipContent>
                                            </Tooltip>
                                          )}
                                          {p.processo_status && p.processo_status !== "vigente" && (
                                            <Badge variant="outline" className="shrink-0 text-[10px]">
                                              {STATUS_ROTULO[p.processo_status] ?? p.processo_status}
                                            </Badge>
                                          )}
                                        </button>
                                        <span className="shrink-0 text-[11px] text-muted-foreground">
                                          {p.passos ?? 0}p · {p.itens_catalogo ?? 0}i · {p.filas ?? 0}f
                                        </span>
                                        <AcaoMover podeEditar={podeEditar} onClick={() => setMoverDialog(p)} />
                                      </div>
                                    ))
                                  ))}
                              </div>
                            );
                          })}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* PAINEL DIREITO */}
            <div>
              {processoSel ? (
                <PainelProcesso
                  linha={processoSel}
                  podeEditar={podeEditar}
                  onMudou={invalidarTudo}
                />
              ) : cadeiraSel ? (
                <ResumoCadeira cadeira={cadeiraSel} linhas={mapa.data ?? []} />
              ) : macroSel ? (
                <ResumoMacro macro={macroSel} />
              ) : (
                <Card>
                  <CardContent className="py-16 text-center text-sm text-muted-foreground">
                    Selecione uma cadeira, um macro-processo ou um processo na árvore.
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {macroDialog && (
          <DialogMacro
            macro={macroDialog === "novo" ? null : macroDialog}
            onClose={() => setMacroDialog(null)}
            onSalvo={invalidarTudo}
          />
        )}

        {moverDialog && (
          <DialogMover
            processo={moverDialog}
            grupos={grupos}
            onClose={() => setMoverDialog(null)}
            onMovido={invalidarTudo}
          />
        )}
      </PageShell>
    </TooltipProvider>
  );
}

function AcaoEditar({ podeEditar, onClick }: { podeEditar: boolean; onClick: () => void }) {
  const botao = (
    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!podeEditar} onClick={onClick}>
      <Pencil className="h-3.5 w-3.5" />
      <span className="sr-only">Editar macro-processo</span>
    </Button>
  );
  if (podeEditar) return botao;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{botao}</span>
      </TooltipTrigger>
      <TooltipContent>{SO_LEITURA}</TooltipContent>
    </Tooltip>
  );
}

function AcaoMover({ podeEditar, onClick }: { podeEditar: boolean; onClick: () => void }) {
  const botao = (
    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!podeEditar} onClick={onClick}>
      <MoveRight className="h-3.5 w-3.5" />
      <span className="sr-only">Mover processo</span>
    </Button>
  );
  if (podeEditar) return botao;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{botao}</span>
      </TooltipTrigger>
      <TooltipContent>{SO_LEITURA}</TooltipContent>
    </Tooltip>
  );
}

// ---------- PAINEL DO PROCESSO ----------
function PainelProcesso({
  linha,
  podeEditar,
  onMudou,
}: {
  linha: LinhaMapa;
  podeEditar: boolean;
  onMudou: () => void;
}) {
  const qc = useQueryClient();
  const id = linha.processo_id!;

  const passos = useQuery({
    queryKey: KEYS.passos(id),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("processo_passo")
        .select("id,ordem,nome,descricao,quem_executa,condicional")
        .eq("processo_id", id)
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        ordem: number | null;
        nome: string;
        descricao: string | null;
        quem_executa: string | null;
        condicional: boolean | null;
      }[];
    },
  });

  const itens = useQuery({
    queryKey: KEYS.itens(id),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("demanda_assunto")
        .select("codigo,nome,ativo")
        .eq("processo_id", id)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as { codigo: string; nome: string; ativo: boolean | null }[];
    },
  });

  const filas = useQuery({
    queryKey: KEYS.filas(id),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tarefas_filas")
        .select("chave,nome,ativo")
        .eq("processo_id", id)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as { chave: string; nome: string; ativo: boolean | null }[];
    },
  });

  const itensLivres = useQuery({
    queryKey: KEYS.itensLivres,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("demanda_assunto")
        .select("codigo,nome")
        .is("processo_id", null)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as { codigo: string; nome: string }[];
    },
  });

  const filasLivres = useQuery({
    queryKey: KEYS.filasLivres,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tarefas_filas")
        .select("chave,nome")
        .is("processo_id", null)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as { chave: string; nome: string }[];
    },
  });

  const [ligarItem, setLigarItem] = useState(false);
  const [itemEscolhido, setItemEscolhido] = useState("");
  const [ligarFila, setLigarFila] = useState(false);
  const [filaEscolhida, setFilaEscolhida] = useState("");

  const mLigarItem = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("mapa_ligar_item" as never, {
        p_assunto_codigo: itemEscolhido,
        p_processo_id: id,
      } as never);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Item de catálogo ligado ao processo.");
      setLigarItem(false);
      setItemEscolhido("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: KEYS.itens(id) }),
        qc.invalidateQueries({ queryKey: KEYS.itensLivres }),
      ]);
      onMudou();
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const mLigarFila = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("mapa_ligar_fila" as never, {
        p_fila_chave: filaEscolhida,
        p_processo_id: id,
      } as never);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Fila ligada ao processo.");
      setLigarFila(false);
      setFilaEscolhida("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: KEYS.filas(id) }),
        qc.invalidateQueries({ queryKey: KEYS.filasLivres }),
      ]);
      onMudou();
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const botaoLigar = (rotulo: string, onClick: () => void) => {
    const b = (
      <Button size="sm" variant="outline" disabled={!podeEditar} onClick={onClick}>
        <Link2 className="mr-1.5 h-4 w-4" />
        {rotulo}
      </Button>
    );
    if (podeEditar) return b;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>{b}</span>
        </TooltipTrigger>
        <TooltipContent>{SO_LEITURA}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{linha.processo}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {linha.processo_codigo ?? "sem código"} · {linha.macro ?? "—"} · {linha.cadeira ?? "—"}
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="processo">
          <TabsList>
            <TabsTrigger value="processo">Processo</TabsTrigger>
            <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
            <TabsTrigger value="trabalho">Trabalho</TabsTrigger>
            <TabsTrigger value="capacidade">Capacidade</TabsTrigger>
          </TabsList>

          <TabsContent value="processo" className="space-y-3 pt-3">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Campo rotulo="Código" valor={linha.processo_codigo} />
              <Campo
                rotulo="Status"
                valor={
                  linha.processo_status
                    ? STATUS_ROTULO[linha.processo_status] ?? linha.processo_status
                    : null
                }
              />
              <Campo rotulo="Abrangência" valor={linha.abrangencia} />
              <Campo rotulo="Owner" valor={linha.owner_nome} />
              <Campo rotulo="Cadeira que responde" valor={linha.cadeira_responde} />
              <Campo rotulo="Templates" valor={String(linha.templates ?? 0)} />
            </dl>

            <div>
              <p className="mb-1 text-sm font-medium">Passos</p>
              {passos.isError ? (
                <ErroQuery o_que="os passos do processo" erro={passos.error} />
              ) : passos.isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (passos.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">nenhum passo mapeado</p>
              ) : (
                <ol className="space-y-1">
                  {passos.data!.map((p) => (
                    <li key={p.id} className="rounded-md border border-border px-2 py-1 text-sm">
                      <span className="mr-2 text-muted-foreground">{p.ordem ?? "—"}</span>
                      {p.nome}
                      {p.condicional && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          condicional
                        </Badge>
                      )}
                      {p.quem_executa && (
                        <span className="ml-2 text-xs text-muted-foreground">{p.quem_executa}</span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </TabsContent>

          <TabsContent value="catalogo" className="space-y-3 pt-3">
            <div className="flex justify-end">{botaoLigar("Ligar item", () => setLigarItem(true))}</div>
            {itens.isError ? (
              <ErroQuery o_que="os itens de catálogo" erro={itens.error} />
            ) : itens.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (itens.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">nenhum item de catálogo ligado a este processo</p>
            ) : (
              <ul className="space-y-1">
                {itens.data!.map((i) => (
                  <li key={i.codigo} className="rounded-md border border-border px-2 py-1 text-sm">
                    {i.nome}
                    <span className="ml-2 text-xs text-muted-foreground">{i.codigo}</span>
                    {i.ativo === false && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        inativo
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <Dialog open={ligarItem} onOpenChange={(o) => !o && setLigarItem(false)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Ligar item de catálogo</DialogTitle>
                  <DialogDescription>
                    Apenas itens que ainda não pertencem a nenhum processo aparecem aqui.
                  </DialogDescription>
                </DialogHeader>
                {itensLivres.isError ? (
                  <ErroQuery o_que="os itens sem processo" erro={itensLivres.error} />
                ) : (
                  <Select value={itemEscolhido} onValueChange={setItemEscolhido}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha o item" />
                    </SelectTrigger>
                    <SelectContent>
                      {(itensLivres.data ?? []).map((i) => (
                        <SelectItem key={i.codigo} value={i.codigo}>
                          {i.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setLigarItem(false)}>
                    Cancelar
                  </Button>
                  <Button
                    disabled={!itemEscolhido || mLigarItem.isPending}
                    onClick={() => mLigarItem.mutate()}
                  >
                    Ligar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="trabalho" className="space-y-3 pt-3">
            <div className="flex justify-end">{botaoLigar("Ligar fila", () => setLigarFila(true))}</div>
            {filas.isError ? (
              <ErroQuery o_que="as filas do processo" erro={filas.error} />
            ) : filas.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (filas.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">nenhuma fila ligada a este processo</p>
            ) : (
              <ul className="space-y-1">
                {filas.data!.map((f) => (
                  <li key={f.chave} className="rounded-md border border-border px-2 py-1 text-sm">
                    {f.nome}
                    <span className="ml-2 text-xs text-muted-foreground">{f.chave}</span>
                    {f.ativo === false && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        inativa
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <Dialog open={ligarFila} onOpenChange={(o) => !o && setLigarFila(false)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Ligar fila de trabalho</DialogTitle>
                  <DialogDescription>
                    Apenas filas ativas sem processo aparecem aqui.
                  </DialogDescription>
                </DialogHeader>
                {filasLivres.isError ? (
                  <ErroQuery o_que="as filas sem processo" erro={filasLivres.error} />
                ) : (
                  <Select value={filaEscolhida} onValueChange={setFilaEscolhida}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha a fila" />
                    </SelectTrigger>
                    <SelectContent>
                      {(filasLivres.data ?? []).map((f) => (
                        <SelectItem key={f.chave} value={f.chave}>
                          {f.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setLigarFila(false)}>
                    Cancelar
                  </Button>
                  <Button
                    disabled={!filaEscolhida || mLigarFila.isPending}
                    onClick={() => mLigarFila.mutate()}
                  >
                    Ligar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="capacidade" className="space-y-3 pt-3">
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-lg font-semibold">{linha.atribuicoes ?? 0}</span>
              <span className="text-muted-foreground">atribuições neste processo</span>
            </div>
            {(linha.atribuicoes ?? 0) === 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Sem atribuição, este processo não gera carga: ninguém tem tempo reservado para
                  executá-lo.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd>{valor && valor.length > 0 ? valor : "—"}</dd>
    </div>
  );
}

function ResumoCadeira({ cadeira, linhas }: { cadeira: CadeiraNo; linhas: LinhaMapa[] }) {
  const totalProc = cadeira.macros.reduce((s, m) => s + m.processos.length, 0);
  const responde =
    linhas.find((l) => l.cadeira_id === cadeira.id && l.cadeira_responde)?.cadeira_responde ?? null;
  const semPasso = cadeira.macros
    .flatMap((m) => m.processos)
    .filter((p) => (p.passos ?? 0) === 0).length;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{cadeira.nome}</CardTitle>
        <p className="text-xs text-muted-foreground">Cadeira</p>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 text-sm">
        <Campo rotulo="Macro-processos" valor={String(cadeira.macros.length)} />
        <Campo rotulo="Processos" valor={String(totalProc)} />
        <Campo rotulo="Processos sem passo" valor={String(semPasso)} />
        <Campo rotulo="Quem responde" valor={responde} />
      </CardContent>
    </Card>
  );
}

function ResumoMacro({ macro }: { macro: MacroNo }) {
  const semPasso = macro.processos.filter((p) => (p.passos ?? 0) === 0).length;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{macro.nome}</CardTitle>
        <p className="text-xs text-muted-foreground">
          Macro-processo · {macro.codigo ?? "sem código"}
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 text-sm">
        <Campo rotulo="Cadeira" valor={macro.cadeira} />
        <Campo rotulo="Processos" valor={String(macro.processos.length)} />
        <Campo rotulo="Processos sem passo" valor={String(semPasso)} />
        <Campo rotulo="Ordem" valor={macro.ordem === null ? null : String(macro.ordem)} />
        <Campo rotulo="Ativo" valor={macro.ativo === false ? "não" : "sim"} />
      </CardContent>
    </Card>
  );
}

// ---------- DIALOG: criar/editar macro ----------
function DialogMacro({
  macro,
  onClose,
  onSalvo,
}: {
  macro: MacroNo | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [nome, setNome] = useState(macro?.nome ?? "");
  const [codigo, setCodigo] = useState(macro?.codigo ?? "");
  const [cadeiraId, setCadeiraId] = useState(macro?.cadeira_id ?? "");
  const [ordem, setOrdem] = useState(macro?.ordem === null || macro?.ordem === undefined ? "" : String(macro.ordem));
  const [ativo, setAtivo] = useState(macro?.ativo !== false);

  const cadeiras = useQuery({
    queryKey: KEYS.cadeiras,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("departamentos")
        .select("id,nome")
        .eq("ativo", true)
        .eq("atende_mesa", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("mapa_salvar_macro" as never, {
        p_id: macro?.id ?? null,
        p_nome: nome.trim(),
        p_codigo: codigo.trim() || null,
        p_cadeira_id: cadeiraId || null,
        p_ordem: ordem.trim() === "" ? null : Number(ordem),
        p_ativo: ativo,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(macro ? "Macro-processo atualizado." : "Macro-processo criado.");
      onSalvo();
      onClose();
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const invalido = nome.trim().length === 0 || !cadeiraId;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{macro ? "Editar macro-processo" : "Novo macro-processo"}</DialogTitle>
          <DialogDescription>
            Trocar a cadeira leva os processos filhos junto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Código</Label>
            <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Cadeira</Label>
            {cadeiras.isError ? (
              <ErroQuery o_que="as cadeiras" erro={cadeiras.error} />
            ) : (
              <Select value={cadeiraId} onValueChange={setCadeiraId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha a cadeira" />
                </SelectTrigger>
                <SelectContent>
                  {(cadeiras.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1">
            <Label>Ordem</Label>
            <Input
              inputMode="numeric"
              value={ordem}
              onChange={(e) => setOrdem(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={ativo} onCheckedChange={setAtivo} id="macro-ativo" />
            <Label htmlFor="macro-ativo">Ativo</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={invalido || salvar.isPending} onClick={() => salvar.mutate()}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- DIALOG: mover processo ----------
function DialogMover({
  processo,
  grupos,
  onClose,
  onMovido,
}: {
  processo: LinhaMapa;
  grupos: [string, { id: string; nome: string }[]][];
  onClose: () => void;
  onMovido: () => void;
}) {
  const [macroId, setMacroId] = useState(processo.macro_id ?? "");

  const mover = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("mapa_mover_processo" as never, {
        p_processo_id: processo.processo_id,
        p_macro_id: macroId,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Processo movido. A cadeira acompanhou o macro-processo.");
      onMovido();
      onClose();
    },
    onError: (e) => toast.error(formatError(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mover processo</DialogTitle>
          <DialogDescription>
            {processo.processo} — hoje em {processo.macro ?? "—"} ({processo.cadeira ?? "—"}).
          </DialogDescription>
        </DialogHeader>

        <Select value={macroId} onValueChange={setMacroId}>
          <SelectTrigger>
            <SelectValue placeholder="Escolha o macro-processo de destino" />
          </SelectTrigger>
          <SelectContent>
            {grupos.map(([cadeira, macros]) => (
              <SelectGroup key={cadeira}>
                <SelectLabel>{cadeira}</SelectLabel>
                {macros.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nome}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!macroId || macroId === processo.macro_id || mover.isPending}
            onClick={() => mover.mutate()}
          >
            Mover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
