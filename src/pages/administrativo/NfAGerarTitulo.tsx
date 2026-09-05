// NF a gerar título — porta de entrada do documento fiscal no contas a pagar.
//
// A triagem já foi feita (destino_codigo declarado). Esta tela dá o passo
// seguinte: virar título. NADA é escrito direto — só pelas RPCs
// fn_nf_gerar_titulo (uma nota) e fn_nf_gerar_titulos_lote (lote).
//
// REGRA DURA: o lote NUNCA roda com p_dry_run=false sem antes ter passado pela
// simulação. É dinheiro parado em fila; um clique errado gera títulos reais.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileCheck2, Info, Loader2, PlayCircle } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Selo, type EstadoSelo } from "@/components/ui/selo";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBRL } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";

const QK = ["nf-a-gerar-titulo"] as const;

interface LinhaFila {
  nf_id: string;
  nf_numero: string | null;
  nf_data_emissao: string | null;
  tipo_documento: string | null;
  fornecedor_razao_social: string | null;
  parceiro_id: string | null;
  valor: number | null;
  data_vencimento: string | null;
  destino_codigo: string | null;
  destino_rotulo: string | null;
  gera_titulo: boolean | null;
  plano_codigo: string | null;
  plano_nome: string | null;
  qtd_duplicatas: number | null;
  situacao: string | null;
}

interface ResultadoLote {
  notas?: number;
  valor?: number;
  titulos_gerados?: number;
  falhas?: number;
  erros?: Array<{ nf?: string; erro?: string }>;
}

const SITUACAO_SELO: Record<string, { tom: EstadoSelo; rotulo: string; motivo: string }> = {
  pronta: {
    tom: "success",
    rotulo: "pronta",
    motivo: "Tem destino que gera título, parceiro identificado e valor. Pode gerar.",
  },
  sem_parceiro: {
    tom: "destructive",
    rotulo: "sem parceiro",
    motivo:
      "O emissor não está identificado como parceiro. Sem identidade não há a quem pagar — cadastre o parceiro antes.",
  },
  nao_gera: {
    tom: "muted",
    rotulo: "não gera título",
    motivo:
      "Decisão declarada em nfs_destino_dim: este destino não gera título a pagar. Não é esquecimento.",
  },
};

function dataBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export default function NfAGerarTitulo() {
  const qc = useQueryClient();
  const [fSituacao, setFSituacao] = useState<string>("todas");
  const [fDestino, setFDestino] = useState<string>("todos");
  const [ordem, setOrdem] = useState<string>("emissao_desc");
  const [sel, setSel] = useState<Set<string>>(new Set());

  const [dialogAberto, setDialogAberto] = useState(false);
  const [passo, setPasso] = useState<1 | 2>(1);
  const [simulacao, setSimulacao] = useState<ResultadoLote | null>(null);
  const [resultado, setResultado] = useState<ResultadoLote | null>(null);

  const fila = useQuery({
    queryKey: [...QK, "lista"],
    queryFn: async (): Promise<LinhaFila[]> => {
      const { data, error } = await (supabase as any).from("vw_nf_a_gerar_titulo").select("*");
      if (error) throw error;
      return (data ?? []) as LinhaFila[];
    },
  });

  const linhas = fila.data ?? [];

  const resumo = useMemo(() => {
    const bloco = (situacao: string) => {
      const ls = linhas.filter((l) => l.situacao === situacao);
      return { qtd: ls.length, valor: ls.reduce((s, l) => s + Number(l.valor ?? 0), 0) };
    };
    return {
      pronta: bloco("pronta"),
      sem_parceiro: bloco("sem_parceiro"),
      nao_gera: bloco("nao_gera"),
    };
  }, [linhas]);

  const destinos = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const l of linhas) {
      if (l.destino_codigo) mapa.set(l.destino_codigo, l.destino_rotulo ?? l.destino_codigo);
    }
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [linhas]);

  const visiveis = useMemo(() => {
    const filtradas = linhas.filter(
      (l) =>
        (fSituacao === "todas" || l.situacao === fSituacao) &&
        (fDestino === "todos" || l.destino_codigo === fDestino),
    );
    const cmpData = (a: LinhaFila, b: LinhaFila) =>
      (a.nf_data_emissao ?? "").localeCompare(b.nf_data_emissao ?? "");
    const cmpValor = (a: LinhaFila, b: LinhaFila) => Number(a.valor ?? 0) - Number(b.valor ?? 0);
    const ordenada = [...filtradas];
    if (ordem === "emissao_asc") ordenada.sort(cmpData);
    else if (ordem === "emissao_desc") ordenada.sort((a, b) => cmpData(b, a));
    else if (ordem === "valor_asc") ordenada.sort(cmpValor);
    else ordenada.sort((a, b) => cmpValor(b, a));
    return ordenada;
  }, [linhas, fSituacao, fDestino, ordem]);

  const prontasVisiveis = visiveis.filter((l) => l.situacao === "pronta");
  const selecionados = useMemo(() => [...sel], [sel]);
  const valorSelecionado = linhas
    .filter((l) => sel.has(l.nf_id))
    .reduce((s, l) => s + Number(l.valor ?? 0), 0);

  const alternar = (id: string) =>
    setSel((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["nf-a-gerar-titulo"] });
    qc.invalidateQueries({ queryKey: ["contas-pagar"] });
    qc.invalidateQueries({ queryKey: ["nfs-stage"] });
  };

  /** Passo 1 — simulação. Sempre p_dry_run: true. Nada é escrito. */
  const simular = useMutation({
    mutationFn: async (): Promise<ResultadoLote> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_nf_gerar_titulos_lote", {
        p_nf_ids: selecionados,
        p_dry_run: true,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) as ResultadoLote;
    },
    onSuccess: (data) => {
      setSimulacao(data ?? {});
      setPasso(1);
      setDialogAberto(true);
    },
    onError: (e) => toast.error(formatError(e)),
  });

  /** Passo 2 — execução. Só habilitado depois da simulação. */
  const executar = useMutation({
    mutationFn: async (): Promise<ResultadoLote> => {
      if (!simulacao) throw new Error("Simulação obrigatória antes de gerar títulos.");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_nf_gerar_titulos_lote", {
        p_nf_ids: selecionados,
        p_dry_run: false,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) as ResultadoLote;
    },
    onSuccess: (data) => {
      setResultado(data ?? {});
      setPasso(2);
      setSel(new Set());
      invalidar();
      const falhas = Number(data?.falhas ?? 0);
      if (falhas > 0) toast.warning(`${data?.titulos_gerados ?? 0} títulos gerados · ${falhas} falhas`);
      else toast.success(`${data?.titulos_gerados ?? 0} títulos gerados`);
    },
    onError: (e) => toast.error(formatError(e)),
  });

  /** Individual — uma nota só, não precisa de simulação. */
  const gerarUma = useMutation({
    mutationFn: async (nfId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_nf_gerar_titulo", { p_nf_id: nfId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Título gerado");
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const fecharDialog = () => {
    setDialogAberto(false);
    setSimulacao(null);
    setResultado(null);
    setPasso(1);
  };

  return (
    <PageShell>
      <PageHeader
        titulo="NF a gerar título"
        icone={FileCheck2}
        estado={
          fila.isLoading
            ? "carregando"
            : `${resumo.pronta.qtd} prontas · ${resumo.sem_parceiro.qtd} sem parceiro · ${resumo.nao_gera.qtd} não geram`
        }
        acoes={
          <Button
            size="sm"
            disabled={selecionados.length === 0 || simular.isPending}
            onClick={() => simular.mutate()}
          >
            {simular.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Gerar títulos
            {selecionados.length > 0 ? ` (${selecionados.length})` : ""}
          </Button>
        }
      />

      <p className="text-xs text-muted-foreground">
        Documento fiscal triado que ainda não virou título a pagar. A geração acontece só pelas
        rotinas do banco, e o lote passa obrigatoriamente por uma simulação antes de escrever.
      </p>

      {fila.isError && <p className="text-sm text-destructive">{formatError(fila.error)}</p>}

      <TooltipProvider>
        {/* RESUMO */}
        <div className="grid gap-[10px] sm:grid-cols-3">
          <Card className="border-l-[3px] border-l-success">
            <CardContent className="p-3">
              <p className="text-[11px] text-muted-foreground">Prontas</p>
              <p className="text-[21px] font-normal tabular-nums">{resumo.pronta.qtd}</p>
              <p className="text-[11px] tabular-nums text-muted-foreground">
                {formatBRL(resumo.pronta.valor)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-l-[3px] border-l-destructive">
            <CardContent className="p-3">
              <p className="text-[11px] text-muted-foreground">Sem parceiro</p>
              <p className="text-[21px] font-normal tabular-nums">{resumo.sem_parceiro.qtd}</p>
              <p className="text-[11px] tabular-nums text-muted-foreground">
                {formatBRL(resumo.sem_parceiro.valor)} · identidade faltando bloqueia a geração
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                Não geram título
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[280px] text-xs">
                    Decisão declarada na dimensão de destinos (nfs_destino_dim): este tipo de
                    documento não vira título a pagar. Não é esquecimento nem pendência.
                  </TooltipContent>
                </Tooltip>
              </p>
              <p className="text-[21px] font-normal tabular-nums">{resumo.nao_gera.qtd}</p>
              <p className="text-[11px] tabular-nums text-muted-foreground">
                {formatBRL(resumo.nao_gera.valor)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* FILTROS */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={fSituacao} onValueChange={setFSituacao}>
            <SelectTrigger className="w-[190px]">
              <SelectValue placeholder="Situação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as situações</SelectItem>
              <SelectItem value="pronta">Prontas</SelectItem>
              <SelectItem value="sem_parceiro">Sem parceiro</SelectItem>
              <SelectItem value="nao_gera">Não geram título</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fDestino} onValueChange={setFDestino}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Destino" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os destinos</SelectItem>
              {destinos.map(([codigo, rotulo]) => (
                <SelectItem key={codigo} value={codigo}>
                  {rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ordem} onValueChange={setOrdem}>
            <SelectTrigger className="w-[210px]">
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="emissao_desc">Emissão (mais recente)</SelectItem>
              <SelectItem value="emissao_asc">Emissão (mais antiga)</SelectItem>
              <SelectItem value="valor_desc">Valor (maior)</SelectItem>
              <SelectItem value="valor_asc">Valor (menor)</SelectItem>
            </SelectContent>
          </Select>
          {selecionados.length > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {selecionados.length} selecionadas · {formatBRL(valorSelecionado)}
            </span>
          )}
        </div>

        {fila.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <Card>
            <CardContent className="px-0 py-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox
                        checked={
                          prontasVisiveis.length > 0 &&
                          prontasVisiveis.every((l) => sel.has(l.nf_id))
                        }
                        disabled={prontasVisiveis.length === 0}
                        onCheckedChange={(v) =>
                          setSel((atual) => {
                            const novo = new Set(atual);
                            for (const l of prontasVisiveis) {
                              if (v) novo.add(l.nf_id);
                              else novo.delete(l.nf_id);
                            }
                            return novo;
                          })
                        }
                        aria-label="Selecionar prontas"
                      />
                    </TableHead>
                    <TableHead>NF</TableHead>
                    <TableHead>Emissão</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Destino</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right">Parcelas</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={12} className="py-8 text-center text-sm text-muted-foreground">
                        Nenhum documento fiscal nesta fila com os filtros atuais.
                      </TableCell>
                    </TableRow>
                  )}
                  {visiveis.map((l) => {
                    const info = SITUACAO_SELO[l.situacao ?? ""] ?? {
                      tom: "muted" as EstadoSelo,
                      rotulo: l.situacao ?? "—",
                      motivo: "Situação não reconhecida.",
                    };
                    const pronta = l.situacao === "pronta";
                    return (
                      <TableRow key={l.nf_id}>
                        <TableCell>
                          {pronta ? (
                            <Checkbox
                              checked={sel.has(l.nf_id)}
                              onCheckedChange={() => alternar(l.nf_id)}
                              aria-label={`Selecionar NF ${l.nf_numero ?? ""}`}
                            />
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-block cursor-not-allowed">
                                  <Checkbox checked={false} disabled />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[280px] text-xs">
                                {info.motivo}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">{l.nf_numero ?? "—"}</TableCell>
                        <TableCell className="tabular-nums">{dataBR(l.nf_data_emissao)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {l.tipo_documento ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate" title={l.fornecedor_razao_social ?? ""}>
                          {l.fornecedor_razao_social ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs">{l.destino_rotulo ?? l.destino_codigo ?? "—"}</TableCell>
                        <TableCell className="text-xs">
                          {l.plano_codigo ? (
                            <>
                              <span className="tabular-nums">{l.plano_codigo}</span>
                              {l.plano_nome && (
                                <p className="text-[11px] text-muted-foreground">{l.plano_nome}</p>
                              )}
                            </>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">{dataBR(l.data_vencimento)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(l.qtd_duplicatas ?? 0) === 0 ? "—" : l.qtd_duplicatas}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatBRL(Number(l.valor ?? 0))}
                        </TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-block">
                                <Selo estado={info.tom}>{info.rotulo}</Selo>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[280px] text-xs">
                              {info.motivo}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          {pronta && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  disabled={gerarUma.isPending}
                                  onClick={() => gerarUma.mutate(l.nf_id)}
                                  aria-label="Gerar título desta nota"
                                >
                                  <PlayCircle className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">
                                Gerar título só desta nota
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </TooltipProvider>

      {/* DIALOG EM DOIS PASSOS: simulação → execução */}
      <Dialog open={dialogAberto} onOpenChange={(aberto) => !aberto && fecharDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {passo === 1 ? "Simulação — nada foi escrito ainda" : "Resultado da geração"}
            </DialogTitle>
            <DialogDescription>
              {passo === 1
                ? "Confira os números antes de confirmar. A geração de títulos só acontece depois da confirmação."
                : "Títulos gerados pelo banco. Falhas, se houver, estão listadas abaixo."}
            </DialogDescription>
          </DialogHeader>

          {passo === 1 && simulacao && (
            <div className="space-y-2 text-sm">
              <p>
                Notas na simulação:{" "}
                <span className="tabular-nums font-medium">
                  {simulacao.notas ?? selecionados.length}
                </span>
              </p>
              <p>
                Valor total:{" "}
                <span className="tabular-nums font-medium">
                  {formatBRL(Number(simulacao.valor ?? valorSelecionado))}
                </span>
              </p>
              {Number(simulacao.falhas ?? 0) > 0 && (
                <p className="text-warning">
                  {simulacao.falhas} nota(s) não passariam na simulação.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Esta chamada rodou em modo simulação: nenhum título foi criado.
              </p>
            </div>
          )}

          {passo === 2 && resultado && (
            <div className="space-y-2 text-sm">
              <p>
                Notas processadas:{" "}
                <span className="tabular-nums font-medium">{resultado.notas ?? 0}</span>
              </p>
              <p>
                Títulos criados:{" "}
                <span className="tabular-nums font-medium">{resultado.titulos_gerados ?? 0}</span>
              </p>
              <p>
                Falhas: <span className="tabular-nums font-medium">{resultado.falhas ?? 0}</span>
              </p>
              {(resultado.erros ?? []).length > 0 && (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border/60 p-2">
                  {(resultado.erros ?? []).map((e, i) => (
                    <p key={`${e.nf ?? i}`} className="text-xs text-destructive">
                      NF {e.nf ?? "—"}: {e.erro ?? "erro não informado"}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {passo === 1 ? (
              <>
                <Button variant="outline" onClick={fecharDialog}>
                  Cancelar
                </Button>
                <Button
                  disabled={!simulacao || executar.isPending}
                  onClick={() => executar.mutate()}
                >
                  {executar.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Confirmar e gerar títulos
                </Button>
              </>
            ) : (
              <Button onClick={fecharDialog}>Fechar</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
