import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  Upload,
  Loader2,
  FileText,
  CheckCircle2,
  AlertTriangle,
  X,
  ArrowRight,
  Globe,
  Receipt,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import {
  parseCsvItau,
  isCsvItau,
  type FaturaParsed,
} from "@/lib/financeiro/parser-fatura-cartao";
import {
  parsearPDFFatura,
  salvarFaturaCartao,
} from "@/lib/financeiro/fatura-cartao-handler";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}

type Etapa = "upload" | "preview" | "salvando" | "concluido";

export function ImportarFaturaCartaoDialog({ open, onOpenChange, onSuccess }: Props) {
  const [etapa, setEtapa] = useState<Etapa>("upload");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [parsed, setParsed] = useState<FaturaParsed | null>(null);
  const [cartaoId, setCartaoId] = useState<string>("");
  const [dataVencimento, setDataVencimento] = useState<string>("");
  const [observacao, setObservacao] = useState<string>("");
  const [parseando, setParseando] = useState(false);
  const [resultadoFinal, setResultadoFinal] = useState<{
    qtd_lancamentos: number;
    compromissos_criados: number;
    parcelas_previstas_criadas: number;
    parcelas_pagas_marcadas: number;
  } | null>(null);

  // Buscar cartões cadastrados — Modelo 3D (cartoes_credito)
  const { data: cartoes } = useQuery({
    queryKey: ["cartoes-credito"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("cartoes_credito")
        .select("id, nome, ultimos_digitos, bandeira")
        .eq("ativo", true)
        .order("nome");
      return (data || []) as { id: string; nome: string; ultimos_digitos: string | null; bandeira: string | null }[];
    },
    enabled: open,
  });

  function reset() {
    setEtapa("upload");
    setArquivo(null);
    setParsed(null);
    setCartaoId("");
    setDataVencimento("");
    setObservacao("");
    setParseando(false);
    setResultadoFinal(null);
  }

  function handleClose() {
    if (parseando) return;
    reset();
    onOpenChange(false);
  }

  async function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = "";

    setArquivo(f);
    setParseando(true);

    try {
      const ext = f.name.split(".").pop()?.toLowerCase();
      let resultado: FaturaParsed;

      if (ext === "csv" || f.type === "text/csv") {
        const texto = await f.text();
        if (!isCsvItau(texto)) {
          toast.error("CSV não reconhecido como formato Itaú. Tente o PDF da fatura.");
          setParseando(false);
          setArquivo(null);
          return;
        }
        resultado = parseCsvItau(texto);
      } else {
        resultado = await parsearPDFFatura(f);
      }

      // Sugerir cartão pelo final detectado (Modelo 3D — ultimos_digitos)
      if (resultado.cartao_numero_final && cartoes) {
        const sugestao = cartoes.find(
          (c) => c.ultimos_digitos === resultado.cartao_numero_final,
        );
        if (sugestao) setCartaoId(sugestao.id);
      }
      // Sugerir vencimento
      if (resultado.data_vencimento) {
        setDataVencimento(resultado.data_vencimento);
      }

      setParsed(resultado);
      setEtapa("preview");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro ao ler arquivo: " + msg);
      setArquivo(null);
    } finally {
      setParseando(false);
    }
  }

  async function handleSalvar() {
    if (!parsed) return;
    if (!cartaoId) {
      toast.error("Selecione o cartão");
      return;
    }
    if (!dataVencimento) {
      toast.error("Defina a data de vencimento");
      return;
    }

    setEtapa("salvando");

    const result = await salvarFaturaCartao({
      parsed,
      cartao_id: cartaoId,
      data_vencimento: dataVencimento,
      arquivo_original: arquivo,
      observacao: observacao || undefined,
    });

    if (!result.ok) {
      toast.error("Erro ao salvar: " + (result.erro || "?"));
      setEtapa("preview");
      return;
    }

    setResultadoFinal({
      qtd_lancamentos: result.qtd_lancamentos || 0,
      compromissos_criados: result.compromissos_criados || 0,
      parcelas_previstas_criadas: result.parcelas_previstas_criadas || 0,
      parcelas_pagas_marcadas: result.parcelas_pagas_marcadas || 0,
    });

    let msg = `Fatura importada! ${result.qtd_lancamentos} lançamento${result.qtd_lancamentos === 1 ? "" : "s"}`;
    if (result.compromissos_criados && result.compromissos_criados > 0) {
      msg += ` + ${result.parcelas_previstas_criadas} parcelas futuras geradas`;
    }
    if (result.parcelas_pagas_marcadas && result.parcelas_pagas_marcadas > 0) {
      msg += ` + ${result.parcelas_pagas_marcadas} parcelas previstas marcadas como pagas`;
    }
    toast.success(msg);
    setEtapa("concluido");
    onSuccess?.();
  }

  const totalCalculado = parsed?.lancamentos
    .filter((l) => l.tipo !== "pagamento")
    .reduce((s, l) => s + l.valor, 0);

  const qtdEstornos = parsed?.lancamentos.filter((l) => l.tipo === "estorno").length || 0;
  const qtdInternacionais =
    parsed?.lancamentos.filter((l) => l.natureza === "INTERNACIONAL").length || 0;
  const qtdParceladas =
    parsed?.lancamentos.filter((l) => l.parcela_atual !== null).length || 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-admin" />
            Importar Fatura de Cartão
          </DialogTitle>
          <DialogDescription>
            Carregue o PDF ou CSV da fatura. Aceita Itaú no momento.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* ETAPA 1 - UPLOAD */}
          {etapa === "upload" && (
            <div className="space-y-4">
              <label className="block border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:bg-muted/30 transition">
                {parseando ? (
                  <>
                    <Loader2 className="h-10 w-10 animate-spin text-admin mx-auto mb-3" />
                    <p className="font-medium">Lendo arquivo...</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      PDFs podem levar até 60 segundos (IA)
                    </p>
                  </>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="font-medium">
                      Selecione o arquivo da fatura
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      PDF (lido por IA) ou CSV (extraído rápido)
                    </p>
                  </>
                )}
                <input
                  type="file"
                  accept=".pdf,.csv,application/pdf,text/csv"
                  onChange={handleArquivo}
                  disabled={parseando}
                  className="hidden"
                />
              </label>

              <div className="rounded-md border bg-muted/20 p-3 text-xs space-y-2">
                <p className="font-medium flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-admin" />
                  Como funciona:
                </p>
                <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
                  <li>O sistema cria 1 conta a pagar no valor total da fatura</li>
                  <li>Cada lançamento da fatura vira um item detalhado classificável</li>
                  <li>Compras parceladas (ex: "02/10") são detectadas automaticamente</li>
                  <li>O PDF original fica anexado à fatura para consulta</li>
                </ul>
              </div>
            </div>
          )}

          {/* ETAPA 2 - PREVIEW */}
          {etapa === "preview" && parsed && (
            <div className="space-y-4">
              {/* Header com arquivo */}
              <div className="flex items-center gap-3 rounded-md border bg-muted/20 p-3">
                <FileText className="h-5 w-5 text-admin shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{arquivo?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {parsed.formato} ·{" "}
                    {parsed.cartao_numero_final && `cartão ****${parsed.cartao_numero_final} · `}
                    {parsed.lancamentos.length} lançamento{parsed.lancamentos.length === 1 ? "" : "s"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    reset();
                  }}
                >
                  <X className="h-4 w-4 mr-1" /> Trocar
                </Button>
              </div>

              {/* Resumo destacado */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <ResumoCard
                  label="Valor total"
                  valor={formatBRL(totalCalculado || 0)}
                  highlight
                />
                <ResumoCard
                  label="Lançamentos"
                  valor={String(parsed.lancamentos.length)}
                />
                <ResumoCard
                  label="Parceladas"
                  valor={String(qtdParceladas)}
                  sub={qtdEstornos > 0 ? "valores negativos" : ""}
                />
                <ResumoCard
                  label="Internacionais"
                  valor={String(qtdInternacionais)}
                  sub={qtdInternacionais > 0 ? "com IOF" : ""}
                />
              </div>

              {/* Configuração */}
              <div className="space-y-3 rounded-md border p-3">
                <p className="text-sm font-medium">Antes de importar:</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Cartão *</Label>
                    <Select value={cartaoId} onValueChange={setCartaoId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o cartão" />
                      </SelectTrigger>
                      <SelectContent>
                        {(cartoes || []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}
                            {c.ultimos_digitos && ` (****${c.ultimos_digitos})`}
                          </SelectItem>
                        ))}
                        {(!cartoes || cartoes.length === 0) && (
                          <div className="px-3 py-2 text-xs text-muted-foreground">
                            Nenhum cartão cadastrado. Cadastre em Cartões de Crédito.
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Vencimento *</Label>
                    <Input
                      type="date"
                      value={dataVencimento}
                      onChange={(e) => setDataVencimento(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Observação (opcional)</Label>
                  <Textarea
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder="Ex: Fatura referência abril 2026"
                    rows={2}
                    className="text-sm"
                  />
                </div>
              </div>

              {/* Lista compacta de lançamentos */}
              <div className="rounded-md border overflow-hidden">
                <div className="bg-muted/40 px-3 py-2 text-xs font-medium flex items-center justify-between">
                  <span>Lançamentos detectados</span>
                  <span className="text-muted-foreground">
                    Você poderá categorizar depois na tela de Faturas
                  </span>
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/30 text-muted-foreground sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-normal">Data</th>
                        <th className="text-left px-3 py-1.5 font-normal">Descrição</th>
                        <th className="text-right px-3 py-1.5 font-normal">Valor</th>
                        <th className="text-center px-3 py-1.5 font-normal">Tipo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.lancamentos.map((l, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-1.5 whitespace-nowrap text-[10px]">
                            {formatDateBR(l.data_compra)}
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate" title={l.descricao}>{l.descricao}</span>
                              {l.parcela_atual && l.parcela_total && (
                                <Badge variant="outline" className="text-[9px] py-0 px-1 h-4">
                                  {l.parcela_atual}/{l.parcela_total}
                                </Badge>
                              )}
                              {l.natureza === "INTERNACIONAL" && (
                                <Globe className="h-3 w-3 text-blue-600" />
                              )}
                            </div>
                          </td>
                          <td
                            className={`px-3 py-1.5 text-right font-mono whitespace-nowrap ${
                              l.valor < 0 ? "text-emerald-700" : ""
                            }`}
                          >
                            {formatBRL(l.valor)}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <Badge
                              variant="outline"
                              className={
                                "text-[9px] py-0 px-1 h-4 " +
                                (l.tipo === "estorno"
                                  ? "border-emerald-300 text-emerald-700"
                                  : l.tipo === "iof"
                                    ? "border-amber-300 text-amber-700"
                                    : l.tipo === "pagamento"
                                      ? "border-blue-300 text-blue-700"
                                      : "")
                              }
                            >
                              {l.tipo}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {parsed.alertas.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs">
                  <p className="font-medium flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
                    Alertas
                  </p>
                  <ul className="list-disc pl-5 text-amber-800">
                    {parsed.alertas.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ETAPA 3 - SALVANDO */}
          {etapa === "salvando" && (
            <div className="py-12 text-center space-y-3">
              <Loader2 className="h-12 w-12 animate-spin text-admin mx-auto" />
              <p className="font-medium">Salvando fatura no sistema...</p>
              <p className="text-xs text-muted-foreground">
                Criando conta a pagar + lançamentos detalhados
              </p>
            </div>
          )}

          {/* ETAPA 4 - CONCLUIDO */}
          {etapa === "concluido" && (
            <div className="py-8 text-center space-y-4">
              <CheckCircle2 className="h-14 w-14 text-emerald-600 mx-auto" />
              <div>
                <p className="font-semibold text-lg">Fatura importada!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Acesse "Faturas de Cartão" para classificar os lançamentos.
                </p>
              </div>

              {resultadoFinal && (
                <div className="rounded-md border bg-muted/20 p-4 max-w-md mx-auto text-left space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Resumo da importação
                  </p>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>
                      <strong>{resultadoFinal.qtd_lancamentos}</strong> lançamento(s) na fatura
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Receipt className="h-4 w-4 text-blue-600 shrink-0" />
                    <span>
                      <strong>1</strong> conta a pagar criada (vai aparecer em Contas a Pagar)
                    </span>
                  </div>
                  {resultadoFinal.compromissos_criados > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <Sparkles className="h-4 w-4 text-violet-600 shrink-0" />
                      <span>
                        <strong>{resultadoFinal.compromissos_criados}</strong> compromisso(s) parcelado(s) detectado(s)
                      </span>
                    </div>
                  )}
                  {resultadoFinal.parcelas_previstas_criadas > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <Sparkles className="h-4 w-4 text-violet-600 shrink-0" />
                      <span>
                        <strong>{resultadoFinal.parcelas_previstas_criadas}</strong> parcelas futuras lançadas no fluxo de caixa
                      </span>
                    </div>
                  )}
                  {resultadoFinal.parcelas_pagas_marcadas > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>
                        <strong>{resultadoFinal.parcelas_pagas_marcadas}</strong> parcelas previstas marcadas como pagas
                      </span>
                    </div>
                  )}
                </div>
              )}

              <Button onClick={handleClose} className="bg-admin">
                Fechar
              </Button>
            </div>
          )}
        </div>

        {/* FOOTER (só na etapa preview) */}
        {etapa === "preview" && (
          <DialogFooter className="border-t pt-3">
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button
              onClick={handleSalvar}
              disabled={!cartaoId || !dataVencimento || (cartoes && cartoes.length === 0)}
              className="gap-2 bg-admin hover:bg-admin-accent text-admin-foreground"
            >
              Importar fatura
              <ArrowRight className="h-4 w-4" />
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResumoCard({
  label,
  valor,
  sub,
  highlight,
}: {
  label: string;
  valor: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-2.5 ${
        highlight ? "bg-admin/10 border-admin/30" : "bg-muted/20"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${highlight ? "text-admin" : ""}`}>{valor}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
