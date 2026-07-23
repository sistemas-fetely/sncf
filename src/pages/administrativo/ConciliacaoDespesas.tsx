import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  GitCompare, Loader2, CheckCircle2, ShieldCheck, AlertTriangle, Search, MailQuestion, Clock, Tags,
} from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { BuscarDocumentoDialog } from "@/components/financeiro/BuscarDocumentoDialog";
import { SolicitarDocumentoDialog } from "@/components/financeiro/SolicitarDocumentoDialog";
import { ClassificarDiretoDialog } from "@/components/financeiro/ClassificarDiretoDialog";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Furo = {
  id: string;
  data_transacao: string;
  banco: string | null;
  valor: number;
  descricao: string | null;
  contraparte_nome: string | null;
  contraparte_documento: string | null;
  tipo_meio: string | null;
  dias_em_aberto: number | null;
  tem_sugestao: boolean;
  fonte_sugestao: "nf" | "cpr" | null;
  sugestao_cpr_id: string | null;
  sugestao_stage_id: string | null;
  sugestao_contraparte: string | null;
  sugestao_score: number | null;
  doc_solicitado_em: string | null;
  doc_solicitado_por: string | null;
  doc_solicitado_nota: string | null;
};

type SugNF = {
  mov_id: string;
  stage_id: string;
  nf_numero: string | null;
  score: number;
  nf_valor: number | null;
  nf_data_emissao: string | null;
  fornecedor_razao_social: string | null;
};

type SugCPR = {
  mov_id: string;
  cpr_valor: number | null;
  data_vencimento: string | null;
  data_pagamento: string | null;
  parceiro_nome: string | null;
};

export default function ConciliacaoDespesas() {
  const qc = useQueryClient();
  
  const [aba, setAba] = useState<"sugestao" | "furos">("sugestao");
  const [processando, setProcessando] = useState<string | null>(null);
  const [loteOpen, setLoteOpen] = useState(false);
  const [loteRunning, setLoteRunning] = useState(false);
  const [buscarOpen, setBuscarOpen] = useState(false);
  const [solicitarOpen, setSolicitarOpen] = useState(false);
  const [classificarOpen, setClassificarOpen] = useState(false);
  const [furoAtivo, setFuroAtivo] = useState<Furo | null>(null);
  const [filtroFuros, setFiltroFuros] = useState<"todos" | "aguardando" | "sem_tratativa">("todos");
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [confirmarLoteOpen, setConfirmarLoteOpen] = useState(false);
  const [confirmarLoteRunning, setConfirmarLoteRunning] = useState(false);

  const { data: furos = [], isLoading } = useQuery({
    queryKey: ["conciliacao-furos"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("vw_conciliacao_furos")
        .select("*")
        .limit(2000);
      if (error) throw error;
      return (data || []) as Furo[];
    },
  });

  const { data: sugestoesNF = [] } = useQuery({
    queryKey: ["conciliacao-sug-nf"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("vw_despesas_match_nf_sugestoes")
        .select("mov_id, stage_id, nf_numero, score, nf_valor, nf_data_emissao, fornecedor_razao_social");
      if (error) throw error;
      return (data || []) as SugNF[];
    },
  });

  const { data: sugestoesCPR = [] } = useQuery({
    queryKey: ["conciliacao-sug-cpr"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("vw_despesas_match_sugestoes")
        .select("mov_id, cpr_valor, data_vencimento, data_pagamento, parceiro_nome");
      if (error) throw error;
      return (data || []) as SugCPR[];
    },
  });

  const nfMap = useMemo(() => {
    const m = new Map<string, SugNF>();
    for (const s of sugestoesNF) m.set(s.mov_id, s);
    return m;
  }, [sugestoesNF]);

  const cprMap = useMemo(() => {
    const m = new Map<string, SugCPR>();
    for (const s of sugestoesCPR) m.set(s.mov_id, s);
    return m;
  }, [sugestoesCPR]);

  const comSugestao = useMemo(
    () =>
      furos
        .filter((f) => f.tem_sugestao)
        .sort(
          (a, b) =>
            (b.sugestao_score ?? 0) - (a.sugestao_score ?? 0) ||
            Number(b.valor) - Number(a.valor),
        ),
    [furos],
  );

  const semSugestao = useMemo(
    () =>
      furos
        .filter((f) => !f.tem_sugestao)
        .sort((a, b) => Number(b.valor) - Number(a.valor)),
    [furos],
  );

  const seguros = useMemo(
    () => comSugestao.filter((f) => (f.sugestao_score ?? 0) >= 5 && f.fonte_sugestao === "nf"),
    [comSugestao],
  );

  const totalFuros = furos.length;
  const valorTotal = furos.reduce((s, f) => s + Number(f.valor || 0), 0);
  const valorComSug = comSugestao.reduce((s, f) => s + Number(f.valor || 0), 0);
  const valorSemSug = semSugestao.reduce((s, f) => s + Number(f.valor || 0), 0);
  const pctExplicavel = totalFuros > 0 ? (comSugestao.length / totalFuros) * 100 : 0;
  const valorSeguros = seguros.reduce((s, f) => s + Number(f.valor || 0), 0);

  async function getUserId(): Promise<string> {
    const { data } = await supabase.auth.getUser();
    if (!data.user?.id) throw new Error("Sessão expirada — refaça o login");
    return data.user.id;
  }

  function invalidar() {
    qc.invalidateQueries({ queryKey: ["conciliacao-furos"] });
    qc.invalidateQueries({ queryKey: ["conciliacao-sug-nf"] });
    qc.invalidateQueries({ queryKey: ["conciliacao-sug-cpr"] });
    qc.invalidateQueries({ queryKey: ["extrato-inbox"] });
  }

  function getValorDoc(f: Furo): number | null {
    if (f.fonte_sugestao === "nf") {
      const nf = nfMap.get(f.id);
      return nf?.nf_valor != null ? Number(nf.nf_valor) : null;
    }
    if (f.fonte_sugestao === "cpr") {
      const c = cprMap.get(f.id);
      return c?.cpr_valor != null ? Number(c.cpr_valor) : null;
    }
    return null;
  }

  function getDataDoc(f: Furo): string | null {
    if (f.fonte_sugestao === "nf") {
      return nfMap.get(f.id)?.nf_data_emissao ?? null;
    }
    if (f.fonte_sugestao === "cpr") {
      const c = cprMap.get(f.id);
      return c?.data_pagamento || c?.data_vencimento || null;
    }
    return null;
  }

  async function confirmarSelecionadas() {
    setConfirmarLoteRunning(true);
    let ok = 0;
    let falhas = 0;
    let primeiraFalha: string | null = null;
    try {
      const p_user_id = await getUserId();
      const alvos = comSugestao.filter((f) => selecionadas.has(f.id));
      for (const f of alvos) {
        try {
          if (f.fonte_sugestao === "nf" && f.sugestao_stage_id) {
            const { error } = await sb.rpc("conciliar_debito_com_nf", {
              p_mov_id: f.id,
              p_stage_id: f.sugestao_stage_id,
              p_user_id,
            });
            if (error) throw error;
          } else if (f.fonte_sugestao === "cpr" && f.sugestao_cpr_id) {
            const { error } = await sb.rpc("confirmar_match_despesa", {
              p_mov_id: f.id,
              p_cpr_id: f.sugestao_cpr_id,
              p_user_id,
            });
            if (error) throw error;
          } else {
            throw new Error("Sugestão inválida");
          }
          ok++;
        } catch (e) {
          falhas++;
          const msg = e instanceof Error ? e.message : String(e);
          if (primeiraFalha == null) primeiraFalha = msg;
        }
      }
      if (falhas === 0) {
        toast.success(`${ok} confirmadas`);
      } else {
        toast.error(`${ok} confirmadas, ${falhas} falharam`, {
          description: primeiraFalha || undefined,
        });
      }
    } catch (e) {
      toast.error("Falha no lote: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setConfirmarLoteRunning(false);
      setConfirmarLoteOpen(false);
      setSelecionadas(new Set());
      invalidar();
    }
  }

  async function confirmarUm(f: Furo) {
    setProcessando(f.id);
    try {
      const p_user_id = await getUserId();
      if (f.fonte_sugestao === "nf" && f.sugestao_stage_id) {
        const { data, error } = await sb.rpc("conciliar_debito_com_nf", {
          p_mov_id: f.id,
          p_stage_id: f.sugestao_stage_id,
          p_user_id,
        });
        if (error) throw error;
        if (data?.divergencia_valor) {
          toast.warning("Conciliado com divergência de valor NF x pago — registrado na observação");
        } else {
          toast.success("Débito conciliado com NF");
        }
      } else if (f.fonte_sugestao === "cpr" && f.sugestao_cpr_id) {
        const { error } = await sb.rpc("confirmar_match_despesa", {
          p_mov_id: f.id,
          p_cpr_id: f.sugestao_cpr_id,
          p_user_id,
        });
        if (error) throw error;
        toast.success("Débito vinculado ao CPR");
      } else {
        throw new Error("Sugestão inválida");
      }
      invalidar();
    } catch (e) {
      toast.error("Falha: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setProcessando(null);
    }
  }

  async function processarLote() {
    setLoteRunning(true);
    let ok = 0;
    const erros: { id: string; msg: string }[] = [];
    try {
      const p_user_id = await getUserId();
      for (const f of seguros) {
        try {
          if (!f.sugestao_stage_id) throw new Error("stage_id ausente");
          const { error } = await sb.rpc("conciliar_debito_com_nf", {
            p_mov_id: f.id,
            p_stage_id: f.sugestao_stage_id,
            p_user_id,
          });
          if (error) throw error;
          ok++;
        } catch (e) {
          erros.push({ id: f.id, msg: e instanceof Error ? e.message : String(e) });
        }
      }
      if (erros.length === 0) {
        toast.success(`${ok} conciliações aplicadas`);
      } else {
        toast.warning(`${ok} conciliados, ${erros.length} com erro`, {
          description: erros.slice(0, 5).map((x) => `${x.id.slice(0, 8)}: ${x.msg}`).join(" · "),
        });
      }
    } catch (e) {
      toast.error("Falha no lote: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoteRunning(false);
      setLoteOpen(false);
      invalidar();
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <GitCompare className="h-6 w-6 text-admin" />
          Conciliar Despesas
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Débitos bancários sem destino: casar com NFs revisadas ou CPRs, ou registrar como furo real.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Débitos sem destino</div>
          <div className="text-2xl font-bold">{totalFuros}</div>
          <div className="text-xs text-muted-foreground mt-1">{formatBRL(valorTotal)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Com sugestão</div>
          <div className="text-2xl font-bold text-emerald-600">{comSugestao.length}</div>
          <div className="text-xs text-muted-foreground mt-1">{formatBRL(valorComSug)}</div>
        </CardContent></Card>
        <Card className="border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/10">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Furos sem sugestão
            </div>
            <div className="text-2xl font-bold text-amber-700 dark:text-amber-500">{semSugestao.length}</div>
            <div className="text-xs text-muted-foreground mt-1">{formatBRL(valorSemSug)}</div>
          </CardContent>
        </Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">% explicável</div>
          <div className="text-2xl font-bold">{pctExplicavel.toFixed(1)}%</div>
          <div className="text-xs text-muted-foreground mt-1">com sugestão / total</div>
        </CardContent></Card>
      </div>

      <ToggleGroup
        type="single"
        value={aba}
        onValueChange={(v) => v && setAba(v as "sugestao" | "furos")}
        className="justify-start"
      >
        <ToggleGroupItem value="sugestao">Com sugestão ({comSugestao.length})</ToggleGroupItem>
        <ToggleGroupItem value="furos">Furos sem match ({semSugestao.length})</ToggleGroupItem>
      </ToggleGroup>

      {aba === "sugestao" && (
        <>
          {seguros.length > 0 && (
            <Card className="border-emerald-300/60 bg-emerald-50/40 dark:bg-emerald-950/10">
              <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  <div>
                    <div className="font-medium text-sm">
                      {seguros.length} matches seguros (score ≥ 5)
                    </div>
                    <div className="text-xs text-muted-foreground">{formatBRL(valorSeguros)}</div>
                  </div>
                </div>
                <Button onClick={() => setLoteOpen(true)} className="gap-1">
                  <ShieldCheck className="h-4 w-4" />
                  Revisar e confirmar todos os seguros
                </Button>
              </CardContent>
            </Card>
          )}

          {(() => {
            const idsVisiveis = comSugestao.map((f) => f.id);
            const nSelecionadas = idsVisiveis.filter((id) => selecionadas.has(id)).length;
            const somaSelecionadas = comSugestao
              .filter((f) => selecionadas.has(f.id))
              .reduce((s, f) => s + Number(f.valor || 0), 0);
            const todasMarcadas =
              idsVisiveis.length > 0 && idsVisiveis.every((id) => selecionadas.has(id));
            const algumasMarcadas = nSelecionadas > 0 && !todasMarcadas;

            function toggleTodas(marcar: boolean) {
              setSelecionadas((prev) => {
                const next = new Set(prev);
                if (marcar) idsVisiveis.forEach((id) => next.add(id));
                else idsVisiveis.forEach((id) => next.delete(id));
                return next;
              });
            }

            function toggleUma(id: string, marcar: boolean) {
              setSelecionadas((prev) => {
                const next = new Set(prev);
                if (marcar) next.add(id);
                else next.delete(id);
                return next;
              });
            }

            return (
              <>
                {nSelecionadas > 0 && (
                  <div className="sticky top-0 z-10 flex items-center justify-between gap-4 rounded-md border bg-primary/5 px-4 py-2 text-sm shadow-sm">
                    <div>
                      <span className="font-medium">{nSelecionadas} selecionadas</span>
                      <span className="text-muted-foreground"> · soma </span>
                      <span className="font-mono font-semibold">{formatBRL(somaSelecionadas)}</span>
                    </div>
                    <Button
                      size="sm"
                      className="gap-1"
                      onClick={() => setConfirmarLoteOpen(true)}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Confirmar selecionadas
                    </Button>
                  </div>
                )}

                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[36px]">
                            <Checkbox
                              checked={todasMarcadas ? true : algumasMarcadas ? "indeterminate" : false}
                              onCheckedChange={(v) => toggleTodas(!!v)}
                              aria-label="Selecionar todas"
                            />
                          </TableHead>
                          <TableHead className="w-[42%]">Débito</TableHead>
                          <TableHead className="w-[42%]">Sugestão</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isLoading && (
                          <TableRow><TableCell colSpan={4} className="text-center py-6">
                            <Loader2 className="h-4 w-4 animate-spin inline" />
                          </TableCell></TableRow>
                        )}
                        {!isLoading && comSugestao.length === 0 && (
                          <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                            Nenhum débito com sugestão
                          </TableCell></TableRow>
                        )}
                        {comSugestao.map((f) => {
                          const nf = nfMap.get(f.id);
                          const seguro = (f.sugestao_score ?? 0) >= 5;
                          const valorDoc = getValorDoc(f);
                          const dataDoc = getDataDoc(f);
                          const valorDebito = Number(f.valor || 0);
                          const delta = valorDoc != null ? valorDoc - valorDebito : null;
                          const bate = delta != null && Math.abs(delta) < 0.01;
                          const checked = selecionadas.has(f.id);
                          return (
                            <TableRow key={f.id} data-state={checked ? "selected" : undefined}>
                              <TableCell className="align-top">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(v) => toggleUma(f.id, !!v)}
                                  aria-label="Selecionar débito"
                                />
                              </TableCell>
                              <TableCell className="text-xs align-top">
                                <div className="font-medium">
                                  {formatDateBR(f.data_transacao)} · {f.banco || "—"}
                                </div>
                                <div className="text-muted-foreground truncate max-w-[420px]" title={f.descricao || ""}>
                                  {f.descricao || "—"}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="font-mono font-semibold">{formatBRL(valorDebito)}</span>
                                  {f.tipo_meio && <Badge variant="outline" className="text-[10px]">{f.tipo_meio}</Badge>}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs align-top">
                                <div className="font-medium">{f.sugestao_contraparte || "—"}</div>
                                {f.fonte_sugestao === "nf" && nf?.nf_numero && (
                                  <div className="text-muted-foreground">NF {nf.nf_numero}</div>
                                )}
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  {valorDoc != null && (
                                    <span className="font-mono font-semibold">{formatBRL(valorDoc)}</span>
                                  )}
                                  {dataDoc && (
                                    <span className="text-muted-foreground">{formatDateBR(dataDoc)}</span>
                                  )}
                                  {delta != null && (
                                    bate ? (
                                      <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">
                                        valor bate
                                      </Badge>
                                    ) : (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] border-amber-400 text-amber-700 dark:text-amber-500"
                                      >
                                        Δ {formatBRL(delta)}
                                      </Badge>
                                    )
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="outline" className="font-mono text-[10px]">
                                    score {f.sugestao_score ?? "?"}
                                  </Badge>
                                  <Badge variant="outline" className="text-[10px] uppercase">
                                    {f.fonte_sugestao}
                                  </Badge>
                                  {seguro && (
                                    <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600 gap-1">
                                      <ShieldCheck className="h-3 w-3" /> seguro
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="align-top">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={processando === f.id}
                                  onClick={() => confirmarUm(f)}
                                  className="gap-1"
                                >
                                  {processando === f.id
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <CheckCircle2 className="h-3.5 w-3.5" />}
                                  Confirmar
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            );
          })()}
        </>
      )}


      {aba === "furos" && (() => {
        const furosFiltrados = semSugestao.filter((f) => {
          if (filtroFuros === "aguardando") return !!f.doc_solicitado_em;
          if (filtroFuros === "sem_tratativa") return !f.doc_solicitado_em;
          return true;
        });
        const totalFiltrado = furosFiltrados.reduce((s, f) => s + Number(f.valor || 0), 0);
        const nAguardando = semSugestao.filter((f) => !!f.doc_solicitado_em).length;
        const nSemTrat = semSugestao.length - nAguardando;
        return (
          <>
            <ToggleGroup
              type="single"
              value={filtroFuros}
              onValueChange={(v) => v && setFiltroFuros(v as typeof filtroFuros)}
              className="justify-start"
            >
              <ToggleGroupItem value="todos">Todos ({semSugestao.length})</ToggleGroupItem>
              <ToggleGroupItem value="aguardando">Aguardando documento ({nAguardando})</ToggleGroupItem>
              <ToggleGroupItem value="sem_tratativa">Sem tratativa ({nSemTrat})</ToggleGroupItem>
            </ToggleGroup>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Banco</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Contraparte</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Dias</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && (
                      <TableRow><TableCell colSpan={7} className="text-center py-6">
                        <Loader2 className="h-4 w-4 animate-spin inline" />
                      </TableCell></TableRow>
                    )}
                    {!isLoading && furosFiltrados.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                        Nenhum furo neste filtro
                      </TableCell></TableRow>
                    )}
                    {furosFiltrados.map((f) => {
                      const diasSol = f.doc_solicitado_em
                        ? Math.max(0, Math.floor(
                            (Date.now() - new Date(f.doc_solicitado_em).getTime()) / 86400000,
                          ))
                        : null;
                      return (
                        <TableRow key={f.id}>
                          <TableCell className="text-xs whitespace-nowrap">{formatDateBR(f.data_transacao)}</TableCell>
                          <TableCell className="text-xs">{f.banco || "—"}</TableCell>
                          <TableCell className="text-xs max-w-[320px] truncate" title={f.descricao || ""}>
                            {f.descricao || "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            <div>{f.contraparte_nome || "—"}</div>
                            {f.contraparte_documento && (
                              <div className="text-muted-foreground">{f.contraparte_documento}</div>
                            )}
                            {diasSol !== null && (
                              <Badge
                                variant="outline"
                                className="text-[10px] mt-1 gap-1 border-amber-400 text-amber-700 dark:text-amber-500"
                                title={f.doc_solicitado_nota || undefined}
                              >
                                <Clock className="h-2.5 w-2.5" />
                                aguardando doc · {diasSol}d
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-right whitespace-nowrap">{formatBRL(Number(f.valor))}</TableCell>
                          <TableCell>
                            {(f.dias_em_aberto ?? 0) > 30 ? (
                              <Badge variant="destructive" className="text-[10px]">{f.dias_em_aberto}d</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">{f.dias_em_aberto ?? 0}d</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                onClick={() => { setFuroAtivo(f); setBuscarOpen(true); }}
                              >
                                <Search className="h-3.5 w-3.5" />
                                Buscar documento
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                onClick={() => { setFuroAtivo(f); setSolicitarOpen(true); }}
                              >
                                <MailQuestion className="h-3.5 w-3.5" />
                                Solicitar doc
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                onClick={() => { setFuroAtivo(f); setClassificarOpen(true); }}
                              >
                                <Tags className="h-3.5 w-3.5" />
                                Classificar direto
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {furosFiltrados.length > 0 && (
                      <TableRow className="bg-muted/40 font-semibold">
                        <TableCell colSpan={4} className="text-xs">Total</TableCell>
                        <TableCell className="font-mono text-right">{formatBRL(totalFiltrado)}</TableCell>
                        <TableCell colSpan={2} />
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        );
      })()}

      <BuscarDocumentoDialog
        open={buscarOpen}
        onOpenChange={setBuscarOpen}
        furo={furoAtivo}
        onDone={invalidar}
      />
      <SolicitarDocumentoDialog
        open={solicitarOpen}
        onOpenChange={setSolicitarOpen}
        furo={furoAtivo}
        onDone={invalidar}
      />
      <ClassificarDiretoDialog
        open={classificarOpen}
        onOpenChange={setClassificarOpen}
        furo={furoAtivo}
        onDone={invalidar}
      />


      <AlertDialog open={loteOpen} onOpenChange={(v) => !loteRunning && setLoteOpen(v)}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar {seguros.length} conciliações seguras</AlertDialogTitle>
            <AlertDialogDescription>
              Revise a lista abaixo. Cada débito será vinculado à NF sugerida, criando um CPR retroativo conciliado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-[50vh] overflow-auto border rounded">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Débito</TableHead>
                  <TableHead>NF / Contraparte</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {seguros.map((f) => {
                  const nf = nfMap.get(f.id);
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="text-xs whitespace-nowrap">{formatDateBR(f.data_transacao)}</TableCell>
                      <TableCell className="text-xs max-w-[220px] truncate" title={f.descricao || ""}>
                        {f.descricao || "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{f.sugestao_contraparte || "—"}</div>
                        {nf?.nf_numero && <div className="text-muted-foreground">NF {nf.nf_numero}</div>}
                      </TableCell>
                      <TableCell className="font-mono text-right whitespace-nowrap">{formatBRL(Number(f.valor))}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loteRunning}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={loteRunning}
              onClick={(e) => {
                e.preventDefault();
                void processarLote();
              }}
            >
              {loteRunning && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar {seguros.length} conciliações
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmarLoteOpen}
        onOpenChange={(v) => !confirmarLoteRunning && setConfirmarLoteOpen(v)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Confirmar {comSugestao.filter((f) => selecionadas.has(f.id)).length} conciliações selecionadas
            </AlertDialogTitle>
            <AlertDialogDescription>
              Soma:{" "}
              <span className="font-mono font-semibold">
                {formatBRL(
                  comSugestao
                    .filter((f) => selecionadas.has(f.id))
                    .reduce((s, f) => s + Number(f.valor || 0), 0),
                )}
              </span>
              . Cada débito com sugestão de NF cria um CPR retroativo conciliado; cada débito com sugestão de CPR vincula o lançamento existente. A ação é aplicada item a item — falhas isoladas não interrompem o restante.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmarLoteRunning}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmarLoteRunning}
              onClick={(e) => {
                e.preventDefault();
                void confirmarSelecionadas();
              }}
            >
              {confirmarLoteRunning && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
