import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { LINHA_CABECALHO_COLADO } from "@/components/tabela/CabecalhoOrdenavel";
import { toast } from "sonner";
import { formatError } from "@/lib/format-error";

const DICA_BLOQUEIO_VENDA =
  "Liberação para venda exige NF de retorno (e transferência de CD, quando a devolução entrou em CD diferente da venda). Avaria e Não conforme continuam disponíveis.";

interface LinhaQuarentena {
  sku: string;
  centro: string;
  devolucao_id: string | null;
  devolucao_numero: string | null;
  nf_numero: string | null;
  cliente: string | null;
  produto: string | null;
  saldo: number;
  ultimo_mov: string | null;
  bloqueio_venda: string | null;
}

interface GrupoQuarentena {
  chave: string;
  devolucaoNumero: string | null;
  nfNumero: string | null;
  cliente: string | null;
  linhas: LinhaQuarentena[];
  unidades: number;
}

type Destino = "sadio" | "avarias" | "nao_conforme";
type DialogoAcao =
  | { modo: "unitario"; para: Destino; linha: LinhaQuarentena }
  | { modo: "lote"; para: Destino; linhas: LinhaQuarentena[] };

const QK_QUARENTENA = ["vw_quarentena_fila"] as const;
const PARA_SADIO: Destino = "sadio";
const PARA_AVARIA: Destino = "avarias";
const PARA_NAO_CONFORME: Destino = "nao_conforme";

function chaveLinha(linha: LinhaQuarentena) {
  return `${linha.devolucao_id ?? "sem-devolucao"}|${linha.sku}|${linha.centro}`;
}

async function carregar(): Promise<{ linhas: LinhaQuarentena[]; exigeDocumento: boolean }> {
  const linhas: LinhaQuarentena[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from("vw_quarentena_fila")
      .select("sku,centro,devolucao_id,devolucao_numero,nf_numero,cliente,produto,saldo,ultimo_mov,bloqueio_venda")
      .order("devolucao_numero", { nullsFirst: false })
      .order("sku")
      .order("centro")
      .range(de, de + 999);
    if (error) throw error;
    const pagina = (data ?? []).filter(
      (linha): linha is LinhaQuarentena => Boolean(linha.sku && linha.centro && Number(linha.saldo) !== 0),
    );
    linhas.push(...pagina.map((linha) => ({ ...linha, saldo: Number(linha.saldo) })));
    if ((data ?? []).length < 1000) break;
  }

  const { data: origem, error: origemError } = await supabase
    .from("estoque_condicao")
    .select("exige_liberacao_para_venda")
    .eq("codigo", "quarentena")
    .eq("ativo", true)
    .maybeSingle();
  if (origemError) throw origemError;
  if (!origem) throw new Error("Condição de estoque 'quarentena' não encontrada ou inativa.");

  return { linhas, exigeDocumento: origem.exige_liberacao_para_venda };
}

const fmt = (n: number) => n.toLocaleString("pt-BR");

function fmtData(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

function tituloAcao(para: Destino) {
  if (para === PARA_SADIO) return "Liberar para venda";
  if (para === PARA_NAO_CONFORME) return "Marcar não conforme";
  return "Marcar avaria";
}

function toastAcao(para: Destino) {
  if (para === PARA_SADIO) return "Liberado para venda";
  if (para === PARA_NAO_CONFORME) return "Marcado como não conforme";
  return "Marcado como avaria";
}

function resultadoComErro(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const resultado = data as Record<string, unknown>;
  if (resultado.ok !== false) return null;
  return typeof resultado.erro === "string"
    ? resultado.erro
    : typeof resultado.error === "string"
      ? resultado.error
      : "A operação não foi concluída.";
}

export function QuarentenaEstoquePainel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: QK_QUARENTENA, queryFn: carregar });
  const [selecionadas, setSelecionadas] = useState<Set<string>>(() => new Set());
  const [gruposFechados, setGruposFechados] = useState<Set<string>>(() => new Set());
  const [dialogo, setDialogo] = useState<DialogoAcao | null>(null);
  const [qtd, setQtd] = useState("");
  const [obs, setObs] = useState("");
  const [docNumero, setDocNumero] = useState("");
  const [salvando, setSalvando] = useState(false);

  const linhas = q.data?.linhas ?? [];
  const linhasSelecionadas = useMemo(
    () => linhas.filter((linha) => selecionadas.has(chaveLinha(linha))),
    [linhas, selecionadas],
  );
  const totais = useMemo(
    () => ({ unidades: linhas.reduce((s, l) => s + l.saldo, 0), skus: new Set(linhas.map((l) => l.sku)).size }),
    [linhas],
  );
  const unidadesSelecionadas = linhasSelecionadas.reduce((s, linha) => s + linha.saldo, 0);
  const grupos = useMemo<GrupoQuarentena[]>(() => {
    const mapa = new Map<string, GrupoQuarentena>();
    for (const linha of linhas) {
      const chave = linha.devolucao_id ?? "sem-devolucao";
      const atual = mapa.get(chave);
      if (atual) {
        atual.linhas.push(linha);
        atual.unidades += linha.saldo;
      } else {
        mapa.set(chave, {
          chave,
          devolucaoNumero: linha.devolucao_numero,
          nfNumero: linha.nf_numero,
          cliente: linha.cliente,
          linhas: [linha],
          unidades: linha.saldo,
        });
      }
    }
    return [...mapa.values()];
  }, [linhas]);

  function marcarLinhas(alvos: LinhaQuarentena[], marcar: boolean) {
    setSelecionadas((atuais) => {
      const proximas = new Set(atuais);
      for (const linha of alvos) {
        const chave = chaveLinha(linha);
        if (marcar) proximas.add(chave);
        else proximas.delete(chave);
      }
      return proximas;
    });
  }

  function abrirUnitario(linha: LinhaQuarentena, para: Destino) {
    setDialogo({ modo: "unitario", linha, para });
    setQtd(String(linha.saldo));
    setObs("");
    setDocNumero("");
  }

  function abrirLote(para: Destino) {
    if (linhasSelecionadas.length === 0) return;
    setDialogo({ modo: "lote", linhas: linhasSelecionadas, para });
    setObs("");
    setDocNumero("");
  }

  const qtdNum = Number(qtd.replace(",", "."));
  const qtdValida = dialogo?.modo === "unitario"
    && Number.isFinite(qtdNum)
    && qtdNum > 0
    && qtdNum <= dialogo.linha.saldo;
  const exigeDocumento = Boolean(q.data?.exigeDocumento && dialogo?.para === PARA_SADIO);
  const documentoValido = !exigeDocumento || docNumero.trim().length > 0;

  async function invalidar() {
    await qc.invalidateQueries({
      predicate: (consulta) => {
        const raiz = consulta.queryKey[0];
        return typeof raiz === "string" && (raiz === QK_QUARENTENA[0] || raiz.startsWith("vw_estoque"));
      },
    });
  }

  async function confirmar() {
    if (!dialogo || !documentoValido || (dialogo.modo === "unitario" && !qtdValida)) return;
    setSalvando(true);
    try {
      if (dialogo.modo === "unitario") {
        const { data, error } = await supabase.rpc("reclassificar_condicao_estoque", {
          p_sku: dialogo.linha.sku,
          p_centro: dialogo.linha.centro,
          p_de: "quarentena",
          p_para: dialogo.para,
          p_quantidade: qtdNum,
          p_obs: obs.trim() || undefined,
          p_doc_numero: docNumero.trim() || undefined,
          p_devolucao_id: dialogo.linha.devolucao_id ?? undefined,
        });
        if (error) throw error;
        const erroResultado = resultadoComErro(data);
        if (erroResultado) throw new Error(erroResultado);
      } else {
        const porCentro = new Map<string, LinhaQuarentena[]>();
        for (const linha of dialogo.linhas) {
          const grupo = porCentro.get(linha.centro) ?? [];
          grupo.push(linha);
          porCentro.set(linha.centro, grupo);
        }
        for (const [centro, linhasCentro] of porCentro) {
          const { data, error } = await supabase.rpc("reclassificar_condicao_estoque_lote", {
            p_linhas: linhasCentro.map((linha) => ({
              sku: linha.sku,
              quantidade: linha.saldo,
              devolucao_id: linha.devolucao_id,
            })),
            p_centro: centro,
            p_de: "quarentena",
            p_para: dialogo.para,
            p_obs: obs.trim() || undefined,
            p_doc_numero: docNumero.trim() || undefined,
          });
          if (error) throw error;
          const erroResultado = resultadoComErro(data);
          if (erroResultado) throw new Error(erroResultado);
        }
      }
      await invalidar();
      toast.success(dialogo.modo === "lote" ? `${toastAcao(dialogo.para)} em lote` : toastAcao(dialogo.para));
      setSelecionadas(new Set());
      setDialogo(null);
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-4 pb-20">
      <div className="grid grid-cols-2 gap-3 md:max-w-md">
        <div className="rounded-md border bg-card p-3">
          <span className="text-[11px] text-muted-foreground">Unidades em quarentena</span>
          <div className="text-[21px] font-medium tabular-nums">{q.isSuccess ? fmt(totais.unidades) : "—"}</div>
        </div>
        <div className="rounded-md border bg-card p-3">
          <span className="text-[11px] text-muted-foreground">SKUs</span>
          <div className="text-[21px] font-medium tabular-nums">{q.isSuccess ? fmt(totais.skus) : "—"}</div>
        </div>
      </div>

      {q.isError && (
        <Alert variant="destructive">
          <AlertDescription>Falha ao carregar a quarentena: {formatError(q.error)}</AlertDescription>
        </Alert>
      )}

      {q.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
      ) : q.isSuccess && linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma mercadoria em quarentena.</p>
      ) : q.isSuccess ? (
        <div className="space-y-3">
          {grupos.map((grupo) => {
            const selecionadasGrupo = grupo.linhas.filter((linha) => selecionadas.has(chaveLinha(linha))).length;
            const grupoMarcado = selecionadasGrupo === grupo.linhas.length;
            const grupoParcial = selecionadasGrupo > 0 && !grupoMarcado;
            const aberto = !gruposFechados.has(grupo.chave);
            const bloqueioGrupo = grupo.linhas.find((linha) => linha.bloqueio_venda)?.bloqueio_venda ?? null;
            return (
              <Collapsible
                key={grupo.chave}
                open={aberto}
                onOpenChange={(novoAberto) => {
                  setGruposFechados((atuais) => {
                    const proximos = new Set(atuais);
                    if (novoAberto) proximos.delete(grupo.chave);
                    else proximos.add(grupo.chave);
                    return proximos;
                  });
                }}
                className="overflow-hidden rounded-md border bg-card"
              >
                <div className="flex min-h-14 items-center gap-3 border-b bg-muted/40 px-4 py-2">
                  <Checkbox
                    checked={grupoParcial ? "indeterminate" : grupoMarcado}
                    onCheckedChange={(marcado) => marcarLinhas(grupo.linhas, marcado === true)}
                    aria-label={`Selecionar grupo ${grupo.devolucaoNumero ?? "sem devolução vinculada"}`}
                  />
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="h-auto min-w-0 flex-1 justify-start px-0 py-1 text-left hover:bg-transparent">
                      {aberto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{grupo.devolucaoNumero ?? "Sem devolução vinculada"}</span>
                        <span className="block truncate text-xs font-normal text-muted-foreground">
                          NF {grupo.nfNumero ?? "—"} · {grupo.cliente ?? "Cliente não identificado"}
                        </span>
                      </span>
                    </Button>
                  </CollapsibleTrigger>
                  <div className="ml-auto shrink-0 text-right text-xs text-muted-foreground">
                    <div>{fmt(grupo.linhas.length)} {grupo.linhas.length === 1 ? "SKU" : "SKUs"}</div>
                    <div className="font-medium text-foreground tabular-nums">{fmt(grupo.unidades)} un</div>
                  </div>
                </div>

                <CollapsibleContent>
                  <Table containerClassName="max-h-[55vh] overflow-auto">
                    <TableHeader>
                      <TableRow className={`${LINHA_CABECALHO_COLADO} [&>th]:!top-0`}>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={grupoParcial ? "indeterminate" : grupoMarcado}
                            onCheckedChange={(marcado) => marcarLinhas(grupo.linhas, marcado === true)}
                            aria-label={`Selecionar todas as linhas de ${grupo.devolucaoNumero ?? "sem devolução"}`}
                          />
                        </TableHead>
                        <TableHead className="w-[150px]">SKU</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead className="w-[130px]">Centro</TableHead>
                        <TableHead className="w-[100px] text-right">Saldo</TableHead>
                        <TableHead className="w-[130px]">Último mov.</TableHead>
                        <TableHead className="w-14" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {grupo.linhas.map((linha) => {
                        const chave = chaveLinha(linha);
                        const marcada = selecionadas.has(chave);
                        return (
                          <TableRow key={chave} data-state={marcada ? "selected" : undefined}>
                            <TableCell>
                              <Checkbox
                                checked={marcada}
                                onCheckedChange={(valor) => marcarLinhas([linha], valor === true)}
                                aria-label={`Selecionar SKU ${linha.sku}`}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-xs">{linha.sku}</TableCell>
                            <TableCell className="text-sm">{linha.produto ?? "—"}</TableCell>
                            <TableCell className="text-sm">{linha.centro}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">{fmt(linha.saldo)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{fmtData(linha.ultimo_mov)}</TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="icon" variant="ghost" aria-label={`Ações do SKU ${linha.sku}`}>
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onSelect={() => abrirUnitario(linha, PARA_SADIO)}>Liberar p/ venda</DropdownMenuItem>
                                  <DropdownMenuItem onSelect={() => abrirUnitario(linha, PARA_AVARIA)}>Marcar avaria</DropdownMenuItem>
                                  <DropdownMenuItem onSelect={() => abrirUnitario(linha, PARA_NAO_CONFORME)}>Não conforme</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      ) : null}

      {linhasSelecionadas.length > 0 && (
        <div className="sticky bottom-0 z-30 -mx-2 flex flex-wrap items-center gap-2 border-t bg-background/95 px-4 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85">
          <div className="mr-auto text-sm font-medium tabular-nums">
            {fmt(linhasSelecionadas.length)} SKUs · {fmt(unidadesSelecionadas)} unidades selecionadas
          </div>
          <Button variant="outline" onClick={() => abrirLote(PARA_SADIO)}>Liberar p/ venda</Button>
          <Button variant="outline" onClick={() => abrirLote(PARA_AVARIA)}>Marcar avaria</Button>
          <Button variant="outline" onClick={() => abrirLote(PARA_NAO_CONFORME)}>Não conforme</Button>
        </div>
      )}

      <Dialog open={dialogo != null} onOpenChange={(aberto) => { if (!aberto && !salvando) setDialogo(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogo ? tituloAcao(dialogo.para) : "Reclassificar estoque"}</DialogTitle>
            <DialogDescription>
              {dialogo?.modo === "unitario"
                ? `${dialogo.linha.sku} · ${dialogo.linha.centro} · saldo em quarentena ${fmt(dialogo.linha.saldo)}`
                : dialogo?.modo === "lote"
                  ? `${fmt(dialogo.linhas.length)} SKUs · ${fmt(dialogo.linhas.reduce((s, linha) => s + linha.saldo, 0))} unidades. A quantidade integral de cada linha será movimentada.`
                  : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {dialogo?.modo === "unitario" && (
              <div className="space-y-1">
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  min={1}
                  max={dialogo.linha.saldo}
                  value={qtd}
                  onChange={(e) => setQtd(e.target.value)}
                  disabled={salvando}
                />
                {!qtdValida && <p className="text-xs text-destructive">Informe de 1 até o saldo da linha.</p>}
              </div>
            )}
            {exigeDocumento && (
              <div className="space-y-1">
                <Label>Documento / laudo</Label>
                <Input value={docNumero} onChange={(e) => setDocNumero(e.target.value)} disabled={salvando} />
                {!documentoValido && <p className="text-xs text-destructive">Informe o documento que autoriza a liberação.</p>}
              </div>
            )}
            <div className="space-y-1">
              <Label>Observação (opcional)</Label>
              <Textarea value={obs} onChange={(e) => setObs(e.target.value)} disabled={salvando} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)} disabled={salvando}>Cancelar</Button>
            <Button
              onClick={() => void confirmar()}
              disabled={salvando || !documentoValido || (dialogo?.modo === "unitario" && !qtdValida)}
            >
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}