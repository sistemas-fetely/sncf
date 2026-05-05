import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FileText,
  Sparkles,
  Loader2,
  Plus,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Trash2,
  History,
  FileSignature,
  Receipt,
  Files,
} from "lucide-react";
import { useParametros } from "@/hooks/useParametros";
import { useFormasPagamento } from "@/hooks/financeiro/useFormasPagamento";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

interface Pasta {
  id: string;
  nome: string;
  descricao: string | null;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  tipo: string;
  area: string | null;
  status: string;
  total_documentos: number;
  total_contratos: number;
  contratos_vigentes: number;
  valor_mensal_estimado: number;
  proximo_vencimento_contrato: string | null;
}

interface ContratoLogico {
  id: string;
  pasta_id: string;
  numero: string;
  data_assinatura: string | null;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  valor_total: number;
  valor_parcela: number;
  ciclo_pagamento: string;
  numero_parcelas: number | null;
  dia_vencimento: number | null;
  data_primeira_parcela: string;
  meio_pagamento_id: string | null;
  tem_setup: boolean;
  valor_setup: number | null;
  parcelas_setup: number | null;
  reajuste_indice: string;
  reajuste_data: string | null;
  renova_automaticamente: boolean;
  permite_valor_variavel: boolean;
  status: string;
  resumo_ia: string | null;
}

interface Parcela {
  id: string;
  contrato_id: string;
  origem: string;
  numero_parcela: number | null;
  total_parcelas: number | null;
  valor: number;
  valor_real: number | null;
  data_vencimento: string;
  conta_pagar_id: string | null;
  status: string;
}

interface EventoHistorico {
  id: string;
  pasta_id: string;
  contrato_id: string | null;
  tipo_evento: string;
  descricao: string;
  valor_anterior: number | null;
  valor_novo: number | null;
  data_evento: string;
  created_at: string;
}

interface Props {
  pasta: Pasta;
  onAtualizado: () => void;
}

export function PastaDetalhe({ pasta, onAtualizado }: Props) {
  const [aba, setAba] = useState("contrato");

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold truncate">{pasta.nome}</h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              {pasta.parceiro_nome && <span>{pasta.parceiro_nome}</span>}
              {pasta.tipo && (
                <>
                  <span>·</span>
                  <Badge variant="outline" className="capitalize">{pasta.tipo}</Badge>
                </>
              )}
              <span>·</span>
              <Badge variant={pasta.status === "ativo" ? "default" : "secondary"}>
                {pasta.status === "ativo" ? "Ativo" : "Encerrado"}
              </Badge>
              {pasta.contratos_vigentes > 0 && (
                <span className="ml-2 text-primary font-medium">
                  {formatBRL(pasta.valor_mensal_estimado)}/mês
                </span>
              )}
            </div>
            {pasta.descricao && (
              <p className="text-sm text-muted-foreground mt-1">{pasta.descricao}</p>
            )}
          </div>
        </div>
      </div>

      {/* Abas */}
      <Tabs value={aba} onValueChange={setAba} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-6 mt-4 grid w-fit grid-cols-4">
          <TabsTrigger value="contrato" className="gap-2">
            <FileSignature className="h-4 w-4" />
            Contrato
          </TabsTrigger>
          <TabsTrigger value="documentos" className="gap-2">
            <Files className="h-4 w-4" />
            Documentos ({pasta.total_documentos})
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-2">
            <History className="h-4 w-4" />
            Histórico
          </TabsTrigger>
          <TabsTrigger value="parcelas" className="gap-2">
            <Receipt className="h-4 w-4" />
            Parcelas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contrato" className="flex-1 overflow-y-auto px-6 py-4 m-0">
          <AbaContrato pasta={pasta} onAtualizado={onAtualizado} />
        </TabsContent>

        <TabsContent value="documentos" className="flex-1 overflow-y-auto px-6 py-4 m-0">
          <AbaDocumentos pastaId={pasta.id} />
        </TabsContent>

        <TabsContent value="historico" className="flex-1 overflow-y-auto px-6 py-4 m-0">
          <AbaHistorico pastaId={pasta.id} />
        </TabsContent>

        <TabsContent value="parcelas" className="flex-1 overflow-y-auto px-6 py-4 m-0">
          <AbaParcelas pastaId={pasta.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Aba Contrato ────────────────────────────────────────────
function AbaContrato({ pasta, onAtualizado }: { pasta: Pasta; onAtualizado: () => void }) {
  const qc = useQueryClient();
  const [novoContratoOpen, setNovoContratoOpen] = useState(false);
  const [gerandoIA, setGerandoIA] = useState(false);
  const [dadosIA, setDadosIA] = useState<any>(null);

  const { data: contratos = [], isLoading } = useQuery({
    queryKey: ["pasta-contratos", pasta.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pasta_contratos")
        .select("*")
        .eq("pasta_id", pasta.id)
        .order("vigencia_inicio", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContratoLogico[];
    },
  });

  async function gerarComIA() {
    setGerandoIA(true);
    try {
      const res = await supabase.functions.invoke("gerar-contrato-de-pasta", {
        body: { pasta_id: pasta.id },
      });
      if (res.error) throw new Error(res.error.message);
      setDadosIA(res.data);
      setNovoContratoOpen(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro IA: " + msg);
    } finally {
      setGerandoIA(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const vigentes = contratos.filter((c) => c.status === "vigente");
  const historicos = contratos.filter((c) => c.status !== "vigente");

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Sem nenhum contrato */}
      {contratos.length === 0 && (
        <div className="rounded-lg border-2 border-dashed p-8 text-center">
          <FileSignature className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground mb-4">
            Nenhum contrato registrado nesta pasta ainda.
          </p>
          <div className="flex gap-2 justify-center">
            <Button onClick={gerarComIA} disabled={gerandoIA}>
              {gerandoIA ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Lendo documentos...</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" /> Gerar contrato com IA</>
              )}
            </Button>
            <Button variant="outline" onClick={() => { setDadosIA(null); setNovoContratoOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Criar manual
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            A IA analisa os documentos da pasta e preenche automaticamente.
          </p>
        </div>
      )}

      {/* Contratos vigentes */}
      {vigentes.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Vigente{vigentes.length > 1 ? "s" : ""}
          </h3>
          <div className="space-y-3">
            {vigentes.map((c) => (
              <ContratoCard key={c.id} contrato={c} pasta={pasta} onAtualizado={() => {
                qc.invalidateQueries({ queryKey: ["pasta-contratos", pasta.id] });
                onAtualizado();
              }} />
            ))}
          </div>
        </div>
      )}

      {/* Histórico de contratos */}
      {historicos.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Histórico ({historicos.length})
          </h3>
          <div className="space-y-2">
            {historicos.map((c) => (
              <div key={c.id} className="border rounded-lg p-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{c.numero}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateBR(c.vigencia_inicio)} →{" "}
                      {c.vigencia_fim ? formatDateBR(c.vigencia_fim) : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{formatBRL(c.valor_total)}</p>
                    <Badge variant="secondary" className="text-xs capitalize">{c.status}</Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Botão adicionar contrato (renovação) */}
      {contratos.length > 0 && (
        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={gerarComIA} disabled={gerandoIA}>
            {gerandoIA ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Lendo...</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" /> Gerar com IA</>
            )}
          </Button>
          <Button variant="outline" onClick={() => { setDadosIA(null); setNovoContratoOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar contrato manual
          </Button>
        </div>
      )}

      {/* Dialog: Novo/Editar Contrato Lógico */}
      <NovoContratoLogicoDialog
        open={novoContratoOpen}
        onOpenChange={setNovoContratoOpen}
        pasta={pasta}
        dadosIA={dadosIA}
        onSalvo={() => {
          qc.invalidateQueries({ queryKey: ["pasta-contratos", pasta.id] });
          qc.invalidateQueries({ queryKey: ["pasta-parcelas", pasta.id] });
          qc.invalidateQueries({ queryKey: ["pasta-historico", pasta.id] });
          setNovoContratoOpen(false);
          setDadosIA(null);
          onAtualizado();
        }}
      />
    </div>
  );
}

// ─── Card de contrato vigente ─────────────────────────────────
function ContratoCard({
  contrato,
  pasta,
  onAtualizado,
}: {
  contrato: ContratoLogico;
  pasta: Pasta;
  onAtualizado: () => void;
}) {
  const qc = useQueryClient();

  const cicloLabel: Record<string, string> = {
    unico: "Único",
    parcelado: `${contrato.numero_parcelas}x parcelado`,
    mensal: "Mensal recorrente",
    trimestral: "Trimestral recorrente",
    anual: "Anual recorrente",
  };

  async function encerrar() {
    if (!confirm(`Encerrar contrato ${contrato.numero}?`)) return;
    try {
      const { error } = await (supabase as any)
        .from("pasta_contratos")
        .update({ status: "encerrado", vigencia_fim: new Date().toISOString().split("T")[0] })
        .eq("id", contrato.id);
      if (error) throw error;

      // Registra no histórico
      await (supabase as any).from("pasta_historico").insert({
        pasta_id: contrato.pasta_id,
        contrato_id: contrato.id,
        tipo_evento: "encerramento",
        descricao: `Contrato ${contrato.numero} encerrado`,
      });

      toast.success("Contrato encerrado");
      qc.invalidateQueries({ queryKey: ["pasta-contratos", contrato.pasta_id] });
      qc.invalidateQueries({ queryKey: ["pasta-historico", contrato.pasta_id] });
      onAtualizado();
    } catch (e) {
      toast.error("Erro: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">{contrato.numero}</p>
          <p className="text-xs text-muted-foreground">
            {formatDateBR(contrato.vigencia_inicio)}
            {contrato.vigencia_fim ? ` → ${formatDateBR(contrato.vigencia_fim)}` : " → sem fim definido"}
          </p>
        </div>
        <Badge className="bg-green-100 text-green-700">Vigente</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div>
          <p className="text-xs text-muted-foreground">Ciclo</p>
          <p className="text-sm font-medium">{cicloLabel[contrato.ciclo_pagamento] ?? contrato.ciclo_pagamento}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Valor parcela</p>
          <p className="text-sm font-medium">{formatBRL(contrato.valor_parcela)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Valor total</p>
          <p className="text-sm font-medium">{formatBRL(contrato.valor_total)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Reajuste</p>
          <p className="text-sm font-medium uppercase">{contrato.reajuste_indice}</p>
        </div>
      </div>

      {contrato.tem_setup && (
        <div className="rounded bg-muted/50 px-3 py-2 mb-3 text-xs">
          <strong>Setup:</strong> {formatBRL(contrato.valor_setup ?? 0)} em {contrato.parcelas_setup}x
        </div>
      )}

      {contrato.permite_valor_variavel && (
        <Badge variant="secondary" className="mb-3 gap-1">
          <AlertTriangle className="h-3 w-3" />
          Valor variável (SaaS)
        </Badge>
      )}

      {contrato.resumo_ia && (
        <p className="text-xs text-muted-foreground italic mb-3">{contrato.resumo_ia}</p>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button variant="outline" size="sm" onClick={encerrar}>
          <Clock className="h-3.5 w-3.5 mr-1.5" />
          Encerrar
        </Button>
      </div>
    </div>
  );
}

// ─── Dialog: Novo Contrato Lógico ─────────────────────────────
function NovoContratoLogicoDialog({
  open,
  onOpenChange,
  pasta,
  dadosIA,
  onSalvo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pasta: Pasta;
  dadosIA: any;
  onSalvo: () => void;
}) {
  const [salvando, setSalvando] = useState(false);

  // Estado dos campos (preenchido por IA ou manual)
  const [numero, setNumero] = useState("");
  const [dataAssinatura, setDataAssinatura] = useState("");
  const [vigenciaInicio, setVigenciaInicio] = useState("");
  const [vigenciaFim, setVigenciaFim] = useState("");
  const [valorTotal, setValorTotal] = useState("0");
  const [valorParcela, setValorParcela] = useState("0");
  const [ciclo, setCiclo] = useState("mensal");
  const [numParcelas, setNumParcelas] = useState("1");
  const [diaVenc, setDiaVenc] = useState("1");
  const [dataPrimeiraParcela, setDataPrimeiraParcela] = useState("");
  const [meioPagId, setMeioPagId] = useState("");
  const [temSetup, setTemSetup] = useState(false);
  const [valorSetup, setValorSetup] = useState("0");
  const [parcelasSetup, setParcelasSetup] = useState("1");
  const [reajuste, setReajuste] = useState("nenhum");
  const [reajusteData, setReajusteData] = useState("");
  const [renovaAuto, setRenovaAuto] = useState(false);
  const [permiteVariavel, setPermiteVariavel] = useState(false);

  const { data: formasPag = [] } = useFormasPagamento();

  // Aplica dados da IA quando recebe
  useState(() => {
    if (dadosIA && open) {
      if (dadosIA.numero_sugerido) setNumero(dadosIA.numero_sugerido);
      if (dadosIA.data_assinatura) setDataAssinatura(dadosIA.data_assinatura);
      if (dadosIA.vigencia_inicio) setVigenciaInicio(dadosIA.vigencia_inicio);
      if (dadosIA.vigencia_fim) setVigenciaFim(dadosIA.vigencia_fim);
      if (dadosIA.valor_total) setValorTotal(String(dadosIA.valor_total));
      if (dadosIA.valor_parcela) setValorParcela(String(dadosIA.valor_parcela));
      if (dadosIA.ciclo_pagamento) setCiclo(dadosIA.ciclo_pagamento);
      if (dadosIA.numero_parcelas) setNumParcelas(String(dadosIA.numero_parcelas));
      if (dadosIA.dia_vencimento) setDiaVenc(String(dadosIA.dia_vencimento));
      if (dadosIA.data_primeira_parcela) setDataPrimeiraParcela(dadosIA.data_primeira_parcela);
      if (typeof dadosIA.tem_setup === "boolean") setTemSetup(dadosIA.tem_setup);
      if (dadosIA.valor_setup) setValorSetup(String(dadosIA.valor_setup));
      if (dadosIA.parcelas_setup) setParcelasSetup(String(dadosIA.parcelas_setup));
      if (dadosIA.reajuste_indice) setReajuste(dadosIA.reajuste_indice);
      if (dadosIA.reajuste_data) setReajusteData(dadosIA.reajuste_data);
      if (typeof dadosIA.renova_automaticamente === "boolean") setRenovaAuto(dadosIA.renova_automaticamente);
      if (typeof dadosIA.permite_valor_variavel === "boolean") setPermiteVariavel(dadosIA.permite_valor_variavel);
    }
    if (!open) {
      // Reset ao fechar
      setNumero(""); setDataAssinatura(""); setVigenciaInicio(""); setVigenciaFim("");
      setValorTotal("0"); setValorParcela("0"); setCiclo("mensal"); setNumParcelas("1");
      setDiaVenc("1"); setDataPrimeiraParcela(""); setMeioPagId("");
      setTemSetup(false); setValorSetup("0"); setParcelasSetup("1");
      setReajuste("nenhum"); setReajusteData(""); setRenovaAuto(false); setPermiteVariavel(false);
    }
  });

  async function salvar() {
    if (!numero.trim()) { toast.error("Número obrigatório"); return; }
    if (!vigenciaInicio) { toast.error("Vigência início obrigatória"); return; }
    if (!dataPrimeiraParcela) { toast.error("Data da 1ª parcela obrigatória"); return; }

    setSalvando(true);
    try {
      const { data: contrato, error } = await (supabase as any)
        .from("pasta_contratos")
        .insert({
          pasta_id: pasta.id,
          numero: numero.trim(),
          data_assinatura: dataAssinatura || null,
          vigencia_inicio: vigenciaInicio,
          vigencia_fim: vigenciaFim || null,
          valor_total: Number(valorTotal),
          valor_parcela: Number(valorParcela),
          ciclo_pagamento: ciclo,
          numero_parcelas: ciclo === "parcelado" ? Number(numParcelas) : null,
          dia_vencimento: ciclo !== "unico" ? Number(diaVenc) : null,
          data_primeira_parcela: dataPrimeiraParcela,
          meio_pagamento_id: meioPagId || null,
          tem_setup: temSetup,
          valor_setup: temSetup ? Number(valorSetup) : null,
          parcelas_setup: temSetup ? Number(parcelasSetup) : null,
          reajuste_indice: reajuste,
          reajuste_data: reajusteData || null,
          renova_automaticamente: renovaAuto,
          permite_valor_variavel: permiteVariavel,
          status: "vigente",
          resumo_ia: dadosIA?.resumo_ia ?? null,
          clausulas_extraidas: dadosIA ? { documentos_usados: dadosIA.documentos_usados ?? [] } : null,
        })
        .select("id")
        .single();

      if (error) throw error;

      // Gera parcelas
      await (supabase as any).rpc("gerar_parcelas_pasta_contrato", {
        p_contrato_id: contrato.id,
      });

      // Histórico
      await (supabase as any).from("pasta_historico").insert({
        pasta_id: pasta.id,
        contrato_id: contrato.id,
        tipo_evento: "novo_contrato",
        descricao: `Contrato ${numero} criado · ${formatBRL(Number(valorTotal))}`,
        valor_novo: Number(valorTotal),
      });

      toast.success("Contrato criado e parcelas geradas");
      onSalvo();
    } catch (e) {
      toast.error("Erro: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {dadosIA ? "Revisar contrato gerado pela IA" : "Novo contrato"}
          </DialogTitle>
        </DialogHeader>

        {dadosIA?.resumo_ia && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm">
            <strong className="text-blue-800">IA:</strong>{" "}
            <span className="text-blue-700">{dadosIA.resumo_ia}</span>
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Número *</Label>
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="CTR-2026-001" />
            </div>
            <div className="space-y-1">
              <Label>Data de assinatura</Label>
              <Input type="date" value={dataAssinatura} onChange={(e) => setDataAssinatura(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Vigência início *</Label>
              <Input type="date" value={vigenciaInicio} onChange={(e) => setVigenciaInicio(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Vigência fim</Label>
              <Input type="date" value={vigenciaFim} onChange={(e) => setVigenciaFim(e.target.value)} />
            </div>
          </div>

          <Separator />
          <h3 className="font-semibold text-sm">Pagamento</h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Ciclo *</Label>
              <Select value={ciclo} onValueChange={setCiclo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unico">Único (1 pagamento)</SelectItem>
                  <SelectItem value="parcelado">Parcelado</SelectItem>
                  <SelectItem value="mensal">Mensal recorrente</SelectItem>
                  <SelectItem value="trimestral">Trimestral recorrente</SelectItem>
                  <SelectItem value="anual">Anual recorrente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Meio de pagamento</Label>
              <Select value={meioPagId} onValueChange={setMeioPagId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {(formasPag as any[]).map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Valor total *</Label>
              <Input type="number" step="0.01" value={valorTotal} onChange={(e) => setValorTotal(e.target.value)} />
            </div>
            {ciclo === "parcelado" && (
              <div className="space-y-1">
                <Label>Nº parcelas</Label>
                <Input type="number" value={numParcelas} onChange={(e) => setNumParcelas(e.target.value)} />
              </div>
            )}
            <div className="space-y-1">
              <Label>Valor parcela *</Label>
              <Input type="number" step="0.01" value={valorParcela} onChange={(e) => setValorParcela(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>1ª parcela em *</Label>
              <Input type="date" value={dataPrimeiraParcela} onChange={(e) => setDataPrimeiraParcela(e.target.value)} />
            </div>
            {ciclo !== "unico" && (
              <div className="space-y-1">
                <Label>Dia vencimento</Label>
                <Input type="number" min={1} max={28} value={diaVenc} onChange={(e) => setDiaVenc(e.target.value)} />
              </div>
            )}
          </div>

          <Separator />
          <div className="flex items-center gap-2">
            <Switch checked={temSetup} onCheckedChange={setTemSetup} />
            <Label>Tem setup/implantação?</Label>
          </div>

          {temSetup && (
            <div className="grid grid-cols-2 gap-3 pl-6">
              <div className="space-y-1">
                <Label>Valor setup</Label>
                <Input type="number" step="0.01" value={valorSetup} onChange={(e) => setValorSetup(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Parcelas setup</Label>
                <Input type="number" value={parcelasSetup} onChange={(e) => setParcelasSetup(e.target.value)} />
              </div>
            </div>
          )}

          <Separator />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Reajuste</Label>
              <Select value={reajuste} onValueChange={setReajuste}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Sem reajuste</SelectItem>
                  <SelectItem value="igpm">IGP-M</SelectItem>
                  <SelectItem value="ipca">IPCA</SelectItem>
                  <SelectItem value="prefixado">Prefixado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {reajuste !== "nenhum" && (
              <div className="space-y-1">
                <Label>Data do reajuste</Label>
                <Input type="date" value={reajusteData} onChange={(e) => setReajusteData(e.target.value)} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Switch checked={renovaAuto} onCheckedChange={setRenovaAuto} />
              <Label>Renova automaticamente</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={permiteVariavel} onCheckedChange={setPermiteVariavel} />
              <Label>Valor variável (SaaS)</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar e gerar parcelas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Aba Documentos (placeholder) ────────────────────────────
function AbaDocumentos({ pastaId }: { pastaId: string }) {
  const qc = useQueryClient();
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [uploads, setUploads] = useState<Record<string, { status: string; erro?: string }>>({});

  const { data: documentos = [], isLoading } = useQuery({
    queryKey: ["pasta-documentos", pastaId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ged_documentos")
        .select("*")
        .eq("pasta_id", pastaId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function processarArquivo(file: File) {
    const key = file.name + "_" + file.size;
    setUploads((u) => ({ ...u, [key]: { status: "subindo" } }));

    try {
      const path = `${pastaId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("ged")
        .upload(path, file, { contentType: file.type });
      if (upErr) throw new Error("Upload: " + upErr.message);

      setUploads((u) => ({ ...u, [key]: { status: "lendo_ia" } }));

      // IA classifica (só PDF)
      let dadosIA: any = null;
      let nomeFinal = file.name.replace(/\.[^/.]+$/, "");
      let tipoDoc = "outro";
      let resumoIA: string | null = null;
      let confianca: string | null = null;

      if (file.type === "application/pdf") {
        const formData = new FormData();
        formData.append("file", file);
        const res = await supabase.functions.invoke("classificar-documento-ged", {
          body: formData,
        });
        if (!res.error && res.data) {
          dadosIA = res.data;
          if (dadosIA.nome_sugerido) nomeFinal = dadosIA.nome_sugerido;
          if (dadosIA.tipo_documento) tipoDoc = dadosIA.tipo_documento;
          if (dadosIA.resumo) resumoIA = dadosIA.resumo;
          if (dadosIA.confianca) confianca = dadosIA.confianca;
        }
      }

      // Salva documento
      const { error: errDoc } = await (supabase as any).from("ged_documentos").insert({
        pasta_id: pastaId,
        nome: nomeFinal,
        arquivo_original: file.name,
        tipo_documento: tipoDoc,
        storage_path: path,
        mime_type: file.type,
        tamanho_bytes: file.size,
        resumo_ia: resumoIA,
        classificacao_ia: dadosIA,
        confianca_ia: confianca,
        tags: dadosIA?.tags_sugeridas ?? [],
      });

      if (errDoc) throw errDoc;

      setUploads((u) => ({ ...u, [key]: { status: "salvo" } }));
      qc.invalidateQueries({ queryKey: ["pasta-documentos", pastaId] });
      qc.invalidateQueries({ queryKey: ["ged-pastas"] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploads((u) => ({ ...u, [key]: { status: "erro", erro: msg } }));
    }
  }

  function handleArquivos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setArquivos((prev) => [...prev, ...files]);
    // Processa em paralelo
    files.forEach((f) => processarArquivo(f));
    e.target.value = "";
  }

  async function excluir(doc: any) {
    if (!confirm(`Excluir "${doc.nome}"?`)) return;
    try {
      await supabase.storage.from("ged").remove([doc.storage_path]);
      const { error } = await (supabase as any)
        .from("ged_documentos")
        .delete()
        .eq("id", doc.id);
      if (error) throw error;
      toast.success("Documento excluído");
      qc.invalidateQueries({ queryKey: ["pasta-documentos", pastaId] });
      qc.invalidateQueries({ queryKey: ["ged-pastas"] });
    } catch (e) {
      toast.error("Erro: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  function statusBadge(s: string) {
    if (s === "subindo")
      return (
        <Badge variant="outline" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Subindo
        </Badge>
      );
    if (s === "lendo_ia")
      return (
        <Badge variant="outline" className="gap-1 bg-blue-50 text-blue-700">
          <Loader2 className="h-3 w-3 animate-spin" /> Lendo IA
        </Badge>
      );
    if (s === "salvo")
      return <Badge className="bg-green-100 text-green-700">✓ Salvo</Badge>;
    if (s === "erro") return <Badge variant="destructive">Erro</Badge>;
    return null;
  }

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Upload area */}
      <div
        className="rounded-lg border-2 border-dashed p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => document.getElementById(`upload-${pastaId}`)?.click()}
      >
        <input
          id={`upload-${pastaId}`}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
          className="hidden"
          onChange={handleArquivos}
        />
        <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Clique para selecionar 1 ou mais arquivos
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          PDF, imagem ou Office · IA classifica automaticamente
        </p>
      </div>

      {/* Uploads em andamento */}
      {arquivos.length > 0 && Object.keys(uploads).length > 0 && (
        <div className="space-y-2">
          {arquivos.map((f) => {
            const key = f.name + "_" + f.size;
            const u = uploads[key];
            if (!u || u.status === "salvo") return null;
            return (
              <div
                key={key}
                className="border rounded-lg p-3 flex items-center gap-3 bg-muted/30"
              >
                <FileText className="h-5 w-5 text-primary" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{f.name}</p>
                  {u.erro && (
                    <p className="text-xs text-destructive">{u.erro}</p>
                  )}
                </div>
                {statusBadge(u.status)}
              </div>
            );
          })}
        </div>
      )}

      {/* Lista de documentos da pasta */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}

      {!isLoading && documentos.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Files className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">Nenhum documento ainda. Suba o primeiro acima.</p>
        </div>
      )}

      {!isLoading && documentos.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {documentos.map((d: any) => (
            <div
              key={d.id}
              className="border rounded-lg p-4 hover:border-primary transition-colors bg-card"
            >
              <div className="flex items-start gap-3">
                <FileText className="h-7 w-7 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm truncate">{d.nome}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs capitalize">
                      {d.tipo_documento}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDateBR(d.created_at)}
                    </span>
                  </div>
                  {d.resumo_ia && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                      {d.resumo_ia}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => excluir(d)}
                  title="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Aba Histórico ────────────────────────────────────────────
function AbaHistorico({ pastaId }: { pastaId: string }) {
  const { data: eventos = [], isLoading } = useQuery({
    queryKey: ["pasta-historico", pastaId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pasta_historico")
        .select("*")
        .eq("pasta_id", pastaId)
        .order("data_evento", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EventoHistorico[];
    },
  });

  const tipoLabel: Record<string, string> = {
    criacao_pasta: "Criação",
    novo_contrato: "Novo contrato",
    reajuste: "Reajuste",
    mudanca_valor: "Mudança de valor",
    upgrade_plano: "Upgrade de plano",
    downgrade_plano: "Downgrade de plano",
    mudanca_status: "Mudança de status",
    documento_adicionado: "Documento adicionado",
    aditivo: "Aditivo",
    renovacao: "Renovação",
    encerramento: "Encerramento",
    outro: "Evento",
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  if (eventos.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <History className="h-10 w-10 mx-auto mb-3 opacity-50" />
        <p className="text-sm">Sem eventos registrados ainda.</p>
        <p className="text-xs mt-2">Mudanças importantes aparecerão aqui automaticamente.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="space-y-3">
        {eventos.map((e) => (
          <div key={e.id} className="flex gap-4 border-l-2 border-primary/30 pl-4 py-2">
            <Calendar className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">{tipoLabel[e.tipo_evento] ?? e.tipo_evento}</Badge>
                <span className="text-xs text-muted-foreground">{formatDateBR(e.data_evento)}</span>
              </div>
              <p className="text-sm mt-1">{e.descricao}</p>
              {e.valor_anterior !== null && e.valor_novo !== null && (
                <p className="text-xs text-muted-foreground mt-1">
                  {formatBRL(e.valor_anterior)} → <strong>{formatBRL(e.valor_novo)}</strong>
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Aba Parcelas ─────────────────────────────────────────────
function AbaParcelas({ pastaId }: { pastaId: string }) {
  const { data: parcelas = [], isLoading } = useQuery({
    queryKey: ["pasta-parcelas", pastaId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pasta_contrato_parcelas")
        .select("*, pasta_contratos!inner(pasta_id, numero)")
        .eq("pasta_contratos.pasta_id", pastaId)
        .order("data_vencimento", { ascending: true });
      if (error) throw error;
      return (data ?? []) as (Parcela & { pasta_contratos: { numero: string } })[];
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  if (parcelas.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Receipt className="h-10 w-10 mx-auto mb-3 opacity-50" />
        <p className="text-sm">Nenhuma parcela gerada ainda.</p>
        <p className="text-xs mt-2">Crie um contrato para gerar parcelas automaticamente.</p>
      </div>
    );
  }

  const statusBadge = (s: string) => {
    if (s === "paga") return <Badge className="bg-green-100 text-green-700"><CheckCircle2 className="h-3 w-3 mr-1" /> Paga</Badge>;
    if (s === "atrasada") return <Badge variant="destructive">Atrasada</Badge>;
    if (s === "cancelada") return <Badge variant="secondary">Cancelada</Badge>;
    return <Badge variant="outline">Pendente</Badge>;
  };

  return (
    <div className="max-w-4xl">
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Contrato</th>
              <th className="text-left px-3 py-2">Origem</th>
              <th className="text-left px-3 py-2">Parcela</th>
              <th className="text-left px-3 py-2">Vencimento</th>
              <th className="text-right px-3 py-2">Valor</th>
              <th className="text-center px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {parcelas.map((p) => (
              <tr key={p.id} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2 text-xs font-mono">{p.pasta_contratos.numero}</td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className="text-xs capitalize">{p.origem}</Badge>
                </td>
                <td className="px-3 py-2 text-xs">
                  {p.numero_parcela}{p.total_parcelas ? ` / ${p.total_parcelas}` : ""}
                </td>
                <td className="px-3 py-2 text-xs">{formatDateBR(p.data_vencimento)}</td>
                <td className="px-3 py-2 text-right font-medium">{formatBRL(p.valor)}</td>
                <td className="px-3 py-2 text-center">{statusBadge(p.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
