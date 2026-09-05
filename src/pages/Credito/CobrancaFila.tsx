import { Fragment, useState } from "react";
import { useAbaUrl } from "@/hooks/useAbaUrl";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCobrancaFila } from "@/hooks/credito/useCobrancaFila";
import { useBaixasPendentes } from "@/hooks/credito/useBaixasPendentes";
import { useTitulosBoleto } from "@/hooks/credito/useTitulosBoleto";
import { useRemessasSafra } from "@/hooks/credito/useRemessasSafra";
import BancoSafra from "@/pages/administrativo/BancoSafra";
import PrimeiroPagamentoTab from "@/pages/Credito/PrimeiroPagamentoTab";
import TitulosTab from "@/pages/Credito/TitulosTab";
import ReguaTab from "@/pages/Credito/ReguaTab";
import SemProvaTab from "@/pages/Credito/SemProvaTab";

import MesaCobranca, { FILAS_AGIR_AGORA, ehLinhaDaMesa } from "@/pages/Credito/MesaCobranca";

import { BadgeBoletoStatus } from "@/components/credito/BadgeBoletoStatus";
import { useTitulosCobranca } from "@/hooks/credito/useTitulosCobranca";
import { useReguaFilaHoje } from "@/hooks/credito/useReguaFila";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { AbaPermitida, ConteudoAba } from "@/components/AbaGate";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BadgeLinkFila } from "@/components/pedidos/LinkPagamentoCard";
import { useLinksPagamentoFila } from "@/hooks/pedidos/useLinkPagamentoPedido";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  Search, FileDown, Upload, CheckCircle2, XCircle, Clock,
  AlertTriangle, FileText, RefreshCw, ChevronDown, ChevronRight,
} from "lucide-react";
import { formatCNPJ } from "@/lib/cnpj";
import { formatBRL } from "@/lib/format-currency";
import { baixarArquivoRemessa } from "@/lib/financeiro/baixarArquivoRemessa";
import { supabase } from "@/integrations/supabase/client";
import type { TituloBoletoPendente, ValidacaoRemessa, BoletoStatus, ResultadoRetorno } from "@/types/credito";
import { useInvalidarRecebivel } from "@/hooks/recebivel/useInvalidarRecebivel";

// ─── helpers ────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "—";

const fmtDateTime = (iso: string) =>
  iso ? new Date(iso).toLocaleString("pt-BR") : "—";

function tempoNaFila(iso: string): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${min % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

// BadgeBoletoStatus foi extraído para src/components/credito/BadgeBoletoStatus.tsx


function MiniPipeline({ titulos }: { titulos: TituloBoletoPendente[] }) {
  const counts = {
    pendente: titulos.filter((t) => t.boleto_status === "pendente").length,
    remessa_gerada: titulos.filter((t) => t.boleto_status === "remessa_gerada").length,
    registrado: titulos.filter((t) => t.boleto_status === "registrado").length,
    rejeitado: titulos.filter((t) => t.boleto_status === "rejeitado").length,
  };
  const stages = [
    { key: "pendente", label: "Pendente", color: "bg-muted-foreground/30" },
    { key: "remessa_gerada", label: "Remessa gerada", color: "bg-warning" },
    { key: "registrado", label: "Registrado", color: "bg-success" },
    { key: "rejeitado", label: "Rejeitado", color: "bg-destructive" },
  ] as const;
  return (
    <div className="flex items-center gap-4 p-4 rounded-md border bg-card">
      {stages.map((s) => (
        <div key={s.key} className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${s.color}`} />
          <span className="text-sm text-muted-foreground">
            {s.label}{" "}
            <span className="font-medium text-foreground">{counts[s.key]}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Modal: Gerar Remessa ────────────────────────────────────────────────────

function GerarRemessaModal({
  open,
  onClose,
  titulos,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  titulos: TituloBoletoPendente[];
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const hoje = new Date(new Date().toDateString());
  const validacoes: ValidacaoRemessa[] = titulos.map((t) => {
    const venc = t.data_vencimento ? new Date(t.data_vencimento + "T00:00:00") : null;
    const motivo = t.cadastro_incompleto
      ? "Cadastro incompleto (endereço ausente)"
      : !t.parceiro_email
      ? "E-mail do parceiro não cadastrado"
      : t.valor_bruto <= 0
      ? "Valor inválido"
      : !venc || venc < hoje
      ? "Vencimento no passado"
      : null;
    return {
      titulo_id: t.titulo_id,
      numero_titulo: t.numero_titulo,
      parceiro_nome: t.parceiro_nome,
      numero_parcela: t.numero_parcela,
      total_parcelas: t.total_parcelas,
      valor_bruto: t.valor_bruto,
      data_vencimento: t.data_vencimento,
      valido: motivo === null,
      motivo_bloqueio: motivo,
    };
  });

  const bloqueados = validacoes.filter((v) => !v.valido);
  const liberados = validacoes.filter((v) => v.valido);
  const valorTotal = liberados.reduce((acc, v) => acc + v.valor_bruto, 0);

  async function handleGerar() {
    if (liberados.length === 0) return;
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).functions.invoke(
        "gerar-remessa-safra",
        { body: { titulo_ids: liberados.map((v) => v.titulo_id) } }
      );
      if (error) throw error;

      const blob = new Blob([data.arquivo_conteudo], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.arquivo_nome;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Remessa gerada",
        description: `${data.arquivo_nome} · Faça o upload no Safra Empresas.`,
      });
      onSuccess();
      onClose();
    } catch (err) {
      toast({
        title: "Erro ao gerar remessa",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gerar Remessa Safra</DialogTitle>
          <DialogDescription>
            {liberados.length} título{liberados.length !== 1 ? "s" : ""} válido
            {liberados.length !== 1 ? "s" : ""} · {formatBRL(valorTotal)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[400px] overflow-auto">
          {validacoes.map((v) => (
            <div key={v.titulo_id} className="flex items-start gap-3 p-3 rounded-md border">
              {v.valido ? (
                <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{v.parceiro_nome}</p>
                <p className="text-xs text-muted-foreground">
                  {v.numero_titulo} · {v.numero_parcela}/{v.total_parcelas} ·{" "}
                  {formatBRL(v.valor_bruto)} · venc {fmtDate(v.data_vencimento)}
                </p>
                {!v.valido && v.motivo_bloqueio && (
                  <p className="text-xs text-destructive mt-1">{v.motivo_bloqueio}</p>
                )}
              </div>
            </div>
          ))}

          {bloqueados.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {bloqueados.length} título{bloqueados.length !== 1 ? "s" : ""} bloqueado
                {bloqueados.length !== 1 ? "s" : ""}. Apenas os {liberados.length} válidos serão
                incluídos na remessa.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleGerar} disabled={loading || liberados.length === 0}>
            {loading ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4 mr-2" />
            )}
            Baixar arquivo .txt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal: Importar Retorno ─────────────────────────────────────────────────

function ImportarRetornoModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<ResultadoRetorno | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const texto = await file.text();
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "processar-retorno-safra",
        { body: { arquivo_conteudo: texto, arquivo_nome: file.name } }
      );
      if (error) {
        let detalhe = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const corpo = await ctx.json();
            if (corpo?.erro) detalhe = corpo.erro;
          } catch { /* corpo não-JSON: fica a mensagem original */ }
        }
        throw new Error(detalhe);
      }
      if (data?.ja_processado) {
        toast({
          title: "Retorno já processado",
          description: data.erro,
        });
        return;
      }
      setResultado(data);
      onSuccess();
    } catch (err) {
      toast({
        title: "Erro ao processar retorno",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleFechar() {
    setResultado(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleFechar()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar Arquivo de Retorno</DialogTitle>
          <DialogDescription>
            Selecione o arquivo .txt devolvido pelo Safra após o processamento da remessa.
          </DialogDescription>
        </DialogHeader>

        {!resultado ? (
          <div className="py-6">
            <label className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-md cursor-pointer hover:bg-muted/50 transition-colors">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {loading ? "Processando..." : "Clique para selecionar o arquivo .txt"}
              </span>
              <input
                type="file"
                accept=".txt,.ret,.RET"
                className="hidden"
                onChange={handleUpload}
                disabled={loading}
              />
            </label>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-4 rounded-md border bg-success/10 text-center">
                <p className="text-2xl font-medium tabular-nums text-success">{resultado.confirmados}</p>
                <p className="text-xs text-success">Confirmados</p>
              </div>
              <div className="p-4 rounded-md border bg-destructive/10 text-center">
                <p className="text-2xl font-medium tabular-nums text-destructive">{resultado.rejeitados}</p>
                <p className="text-xs text-destructive">Rejeitados</p>
              </div>
              <div className="p-4 rounded-md border bg-info/10 text-center">
                <p className="text-2xl font-medium tabular-nums text-info">{resultado.emails_enviados}</p>
                <p className="text-xs text-info">E-mails enviados</p>
              </div>
            </div>

            {resultado.detalhes_rejeicao.length > 0 && (
              <div className="space-y-2 max-h-[300px] overflow-auto">
                <p className="text-sm font-medium">Títulos rejeitados:</p>
                {resultado.detalhes_rejeicao.map((r, i) => (
                  <div key={i} className="p-3 rounded-md border bg-destructive/5">
                    <p className="text-sm font-medium">
                      {r.parceiro_nome} · {r.numero_titulo}
                    </p>
                    <p className="text-xs text-destructive">
                      Código {r.codigo_rejeicao}: {r.motivo}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleFechar}>
            {resultado ? "Fechar" : "Cancelar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tab 2: Títulos ──────────────────────────────────────────────────────────

function TitulosBoletoTab() {
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<BoletoStatus | "todos">("todos");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [gerarOpen, setGerarOpen] = useState(false);
  const qc = useQueryClient();
  const invalidarRecebivel = useInvalidarRecebivel();

  const { data = [], isLoading } = useTitulosBoleto({
    busca: busca || undefined,
    status: filtroStatus,
  });

  const titulos = data;
  const pendentes = titulos.filter((t) => t.boleto_status === "pendente");
  const titulosSelecionados = pendentes.filter((t) => selecionados.has(t.titulo_id));

  function toggleSelecionado(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTodos() {
    if (selecionados.size === pendentes.length && pendentes.length > 0) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(pendentes.map((t) => t.titulo_id)));
    }
  }

  const statusFiltros: Array<{ value: BoletoStatus | "todos"; label: string }> = [
    { value: "todos", label: "Todos" },
    { value: "pendente", label: "Pendente" },
    { value: "remessa_gerada", label: "Remessa gerada" },
    { value: "registrado", label: "Registrado" },
    { value: "rejeitado", label: "Rejeitado" },
  ];

  return (
    <div className="space-y-4">
      <MiniPipeline titulos={titulos} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[240px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, CNPJ, pedido ou título..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {statusFiltros.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFiltroStatus(f.value)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                filtroStatus === f.value
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:border-foreground/40"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {selecionados.size > 0 && (
          <Button onClick={() => setGerarOpen(true)} className="ml-auto">
            <FileDown className="h-4 w-4 mr-2" />
            Gerar Remessa Safra ({selecionados.size})
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={selecionados.size === pendentes.length && pendentes.length > 0}
                  onCheckedChange={toggleTodos}
                  aria-label="Selecionar todos pendentes"
                />
              </TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead>Parcela</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="py-6">
                  <Skeleton className="h-10 w-full" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && titulos.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Nenhum título na fila com esse filtro.
                </TableCell>
              </TableRow>
            )}
            {titulos.map((t) => {
              const isPendente = t.boleto_status === "pendente";
              const isChecked = selecionados.has(t.titulo_id);
              return (
                <TableRow key={t.titulo_id}>
                  <TableCell>
                    <Checkbox
                      checked={isChecked}
                      disabled={!isPendente}
                      onCheckedChange={() => isPendente && toggleSelecionado(t.titulo_id)}
                    />
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{t.parceiro_nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.parceiro_cnpj ? formatCNPJ(t.parceiro_cnpj) : "—"}
                    </p>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-primary">{t.pedido_id_externo}</span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {t.numero_parcela}/{t.total_parcelas}
                  </TableCell>
                  <TableCell className="text-sm">{fmtDate(t.data_vencimento)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatBRL(t.valor_bruto)}
                  </TableCell>
                  <TableCell>
                    <BadgeBoletoStatus
                      status={t.boleto_status}
                      codigoRejeicao={t.boleto_codigo_rejeicao}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <GerarRemessaModal
        open={gerarOpen}
        onClose={() => setGerarOpen(false)}
        titulos={titulosSelecionados}
        onSuccess={async () => {
          setSelecionados(new Set());
          await invalidarRecebivel();
        }}
      />
    </div>
  );
}

// ─── Tab 3: Remessas ─────────────────────────────────────────────────────────

type RemessaTituloRow = {
  remessa_id: string;
  titulo_id: string;
  numero_titulo: string | null;
  cliente: string | null;
  pedido_externo: string | null;
  nosso_numero_seq: number | string | null;
  data_vencimento_atual: string | null;
  valor_bruto: number | null;
  boleto_status: string | null;
};

function useRemessaTitulos(remessaId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["remessa-safra-titulos", remessaId],
    enabled: enabled && !!remessaId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_remessa_safra_titulos")
        .select(
          "remessa_id, titulo_id, numero_titulo, cliente, pedido_externo, nosso_numero_seq, data_vencimento_atual, valor_bruto, boleto_status",
        )
        .eq("remessa_id", remessaId)
        .order("data_vencimento_atual", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RemessaTituloRow[];
    },
  });
}

function TabelaTitulosRemessa({
  remessaId,
  cancelada,
  observacao,
}: {
  remessaId: string;
  cancelada: boolean;
  observacao: string | null;
}) {
  const { data: titulos = [], isLoading, isError, error } = useRemessaTitulos(remessaId, true);

  if (isLoading) {
    return (
      <div className="space-y-1.5 p-3">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-2/3" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-3 text-xs text-destructive">
        Falha ao carregar títulos: {(error as Error).message}
      </div>
    );
  }

  if (titulos.length === 0) {
    if (cancelada) {
      return (
        <div className="p-3 text-xs text-muted-foreground space-y-1.5">
          <p>Títulos já liberados — ver histórico abaixo</p>
          {observacao && (
            <pre className="whitespace-pre-wrap rounded-md border bg-background/60 p-2 font-mono text-[11px] text-foreground">
              {observacao}
            </pre>
          )}
        </div>
      );
    }
    return <div className="p-3 text-xs text-muted-foreground">Nenhum título nesta remessa.</div>;
  }

  const soma = titulos.reduce((s, t) => s + Number(t.valor_bruto ?? 0), 0);

  return (
    <div className="rounded-md border bg-background/60 overflow-hidden m-2">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr className="text-left">
            <th className="px-3 py-1.5 font-medium">Título</th>
            <th className="px-3 py-1.5 font-medium">Cliente</th>
            <th className="px-3 py-1.5 font-medium">Pedido</th>
            <th className="px-3 py-1.5 font-medium">Nosso número</th>
            <th className="px-3 py-1.5 font-medium">Vencimento</th>
            <th className="px-3 py-1.5 font-medium text-right">Valor</th>
            <th className="px-3 py-1.5 font-medium">Status hoje</th>
          </tr>
        </thead>
        <tbody>
          {titulos.map((t) => (
            <tr key={t.titulo_id} className="border-t">
              <td className="px-3 py-1.5 font-mono">{t.numero_titulo ?? "—"}</td>
              <td className="px-3 py-1.5">{t.cliente ?? "—"}</td>
              <td className="px-3 py-1.5 font-mono">{t.pedido_externo ?? "—"}</td>
              <td className="px-3 py-1.5 font-mono">{t.nosso_numero_seq ?? "—"}</td>
              <td className="px-3 py-1.5">
                {t.data_vencimento_atual ? fmtDate(t.data_vencimento_atual) : "—"}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {formatBRL(Number(t.valor_bruto ?? 0))}
              </td>
              <td className="px-3 py-1.5">
                {t.boleto_status ? <BadgeBoletoStatus status={t.boleto_status as BoletoStatus} /> : "—"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-muted/30">
          <tr className="border-t">
            <td className="px-3 py-1.5 font-medium" colSpan={5}>
              {titulos.length} título{titulos.length === 1 ? "" : "s"}
            </td>
            <td className="px-3 py-1.5 text-right font-medium tabular-nums">{formatBRL(soma)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function CancelarRemessaDialog({
  remessa,
  onClose,
}: {
  remessa: { id: string; arquivo_nome: string } | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const invalidarRecebivel = useInvalidarRecebivel();
  const { toast } = useToast();
  const [motivo, setMotivo] = useState("");
  const [cancelando, setCancelando] = useState(false);
  const { data: titulos = [], isLoading } = useRemessaTitulos(remessa?.id ?? null, !!remessa);

  async function confirmar() {
    if (!remessa) return;
    setCancelando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("cancelar_remessa_safra", {
        p_remessa_id: remessa.id,
        p_motivo: motivo.trim(),
      });
      if (error) throw error;
      const liberados = data?.titulos_liberados ?? 0;
      toast({
        title: `${data?.arquivo_nome ?? remessa.arquivo_nome} cancelada — ${liberados} título(s) liberado(s)`,
      });
      await invalidarRecebivel();
      setMotivo("");
      onClose();
    } catch (e) {
      toast({
        title: "Erro ao cancelar remessa",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setCancelando(false);
    }
  }

  return (
    <Dialog
      open={!!remessa}
      onOpenChange={(o) => {
        if (!o && !cancelando) {
          setMotivo("");
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Cancelar remessa {remessa?.arquivo_nome}</DialogTitle>
        </DialogHeader>

        <Alert className="border-warning/40 bg-warning/10">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning">
            A remessa não será apagada — o número sequencial é a prova perante o Safra. Ela ficará
            marcada como cancelada e os títulos voltam ao estado anterior.
          </AlertDescription>
        </Alert>

        <div className="rounded-md border overflow-hidden max-h-[240px] overflow-y-auto">
          {isLoading ? (
            <div className="p-3 space-y-1.5">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-2/3" />
            </div>
          ) : titulos.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">Nenhum título vinculado.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-1.5 font-medium">Título</th>
                  <th className="px-3 py-1.5 font-medium">Cliente</th>
                  <th className="px-3 py-1.5 font-medium">Vencimento</th>
                  <th className="px-3 py-1.5 font-medium text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {titulos.map((t) => (
                  <tr key={t.titulo_id} className="border-t">
                    <td className="px-3 py-1.5 font-mono">{t.numero_titulo ?? "—"}</td>
                    <td className="px-3 py-1.5">{t.cliente ?? "—"}</td>
                    <td className="px-3 py-1.5">
                      {t.data_vencimento_atual ? fmtDate(t.data_vencimento_atual) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {formatBRL(Number(t.valor_bruto ?? 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Motivo do cancelamento</label>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por que esta remessa está sendo cancelada?"
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setMotivo("");
              onClose();
            }}
            disabled={cancelando}
          >
            Voltar
          </Button>
          <Button variant="destructive" onClick={confirmar} disabled={cancelando || !motivo.trim()}>
            {cancelando ? "Cancelando..." : "Confirmar cancelamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemessasSafraTab() {
  const invalidarRecebivel = useInvalidarRecebivel();
  const [importarOpen, setImportarOpen] = useState(false);

  const [marcarEnviadaTarget, setMarcarEnviadaTarget] = useState<{ id: string; arquivo_nome: string } | null>(null);
  const [marcandoEnviada, setMarcandoEnviada] = useState(false);
  const [cancelarTarget, setCancelarTarget] = useState<{ id: string; arquivo_nome: string } | null>(null);
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: remessas = [], isLoading } = useRemessasSafra();

  const toggleExpandida = (id: string) =>
    setExpandidas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function baixarNovamente(conteudo: string | null, arquivoNome: string) {
    try {
      baixarArquivoRemessa(conteudo, arquivoNome);
      toast({ title: "Arquivo baixado", description: arquivoNome });
    } catch (e) {
      toast({
        title: "Erro ao baixar remessa",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  }

  async function confirmarMarcarEnviada() {
    if (!marcarEnviadaTarget) return;
    setMarcandoEnviada(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const uid = userData?.user?.id ?? null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("remessas_safra")
        .update({
          status: "enviada",
          enviada_em: new Date().toISOString(),
          enviada_por: uid,
        })
        .eq("id", marcarEnviadaTarget.id);
      if (error) throw error;
      toast({ title: "Remessa marcada como enviada", description: marcarEnviadaTarget.arquivo_nome });
      await invalidarRecebivel();
      setMarcarEnviadaTarget(null);
    } catch (e) {
      toast({
        title: "Erro ao marcar como enviada",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setMarcandoEnviada(false);
    }
  }

  const statusMap: Record<string, { label: string; className: string }> = {
    gerada: { label: "Gerada", className: "bg-warning/15 text-warning" },
    enviada: { label: "Enviada", className: "bg-info/15 text-info" },
    processada: {
      label: "Processada",
      className: "bg-success/15 text-success",
    },
    com_rejeicoes: {
      label: "Com rejeições",
      className: "bg-destructive/15 text-destructive",
    },
    cancelada: {
      label: "Cancelada",
      className: "bg-destructive/15 text-destructive",
    },
  };

  const umDiaMs = 24 * 60 * 60 * 1000;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {remessas.length} remessa{remessas.length !== 1 ? "s" : ""} gerada
          {remessas.length !== 1 ? "s" : ""}
        </p>
        <Button variant="outline" onClick={() => setImportarOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Importar Retorno
        </Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table className="min-w-[960px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Arquivo</TableHead>
              <TableHead>Gerada em</TableHead>
              <TableHead>Enviada em</TableHead>
              <TableHead className="text-right">Títulos</TableHead>
              <TableHead className="text-right">Valor total</TableHead>
              <TableHead>Retorno processado</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>

          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={9} className="py-6">
                  <Skeleton className="h-10 w-full" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && remessas.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Nenhuma remessa gerada ainda.
                </TableCell>
              </TableRow>
            )}
            {remessas.map((r) => {
              const s = statusMap[r.status] ?? statusMap.gerada;
              const esquecida =
                r.status === "gerada" &&
                !r.enviada_em &&
                Date.now() - new Date(r.gerado_em).getTime() > umDiaMs;
              const aberta = expandidas.has(r.id);
              return (
                <Fragment key={r.id}>
                  <TableRow
                    className={esquecida ? "bg-warning/5 hover:bg-warning/10" : undefined}
                    title={
                      esquecida
                        ? "Gerada e nunca marcada como enviada — o arquivo subiu no SafraNet?"
                        : undefined
                    }
                  >
                    <TableCell className="w-8">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => toggleExpandida(r.id)}
                        aria-label={aberta ? "Recolher títulos" : "Ver títulos"}
                      >
                        {aberta ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <div className="flex items-center gap-1.5">
                        {esquecida && (
                          <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                        )}
                        {r.arquivo_nome}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{fmtDateTime(r.gerado_em)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.enviada_em ? fmtDateTime(r.enviada_em) : "—"}
                    </TableCell>
                    <TableCell className="text-right">{r.qtd_titulos}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatBRL(r.valor_total)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.retorno_processado_em ? fmtDateTime(r.retorno_processado_em) : "—"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.className}`}
                      >
                        {s.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {r.status === "gerada" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setMarcarEnviadaTarget({ id: r.id, arquivo_nome: r.arquivo_nome })
                            }
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                            Marcar enviada
                          </Button>
                        )}
                        {r.status === "gerada" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive/80"
                            onClick={() =>
                              setCancelarTarget({ id: r.id, arquivo_nome: r.arquivo_nome })
                            }
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1.5" />
                            Cancelar
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!r.conteudo}
                          title={!r.conteudo ? "Arquivo não disponível (remessa anterior ao histórico)" : undefined}
                          onClick={() => baixarNovamente(r.conteudo, r.arquivo_nome)}
                        >
                          <FileDown className="h-3.5 w-3.5 mr-1.5" />
                          Baixar arquivo
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {aberta && (
                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableCell colSpan={9} className="p-0">
                        <TabelaTitulosRemessa
                          remessaId={r.id}
                          cancelada={r.status === "cancelada"}
                          observacao={r.observacao}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}

          </TableBody>
        </Table>
      </div>

      <ImportarRetornoModal
        open={importarOpen}
        onClose={() => setImportarOpen(false)}
        onSuccess={async () => {
          await invalidarRecebivel();
        }}
      />

      <CancelarRemessaDialog remessa={cancelarTarget} onClose={() => setCancelarTarget(null)} />

      <Dialog
        open={!!marcarEnviadaTarget}
        onOpenChange={(o) => !o && !marcandoEnviada && setMarcarEnviadaTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar remessa como enviada</DialogTitle>
            <DialogDescription>
              Confirma que o arquivo{" "}
              <span className="font-mono">{marcarEnviadaTarget?.arquivo_nome}</span> foi enviado ao
              SafraNet?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMarcarEnviadaTarget(null)}
              disabled={marcandoEnviada}
            >
              Cancelar
            </Button>
            <Button onClick={confirmarMarcarEnviada} disabled={marcandoEnviada}>
              {marcandoEnviada ? "Marcando..." : "Confirmar envio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ─── Tab 1: Pedidos (comportamento original) ─────────────────────────────────

function PedidosCobrancaTab() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const { data, isLoading } = useCobrancaFila({ busca: busca || undefined });
  const total = data?.length ?? 0;
  const { data: linksFila } = useLinksPagamentoFila((data ?? []).map((p) => p.pedido_id));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {total} pedido{total !== 1 ? "s" : ""} aguardando materialização de títulos
      </p>

      <div className="relative max-w-sm">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por número do pedido, cliente ou CNPJ..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID Externo</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Condição</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Na fila</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-6">
                  <Skeleton className="h-10 w-full" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && total === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhum pedido em cobrança.
                </TableCell>
              </TableRow>
            )}
            {data?.map((p) => (
              <TableRow
                key={p.pedido_id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => navigate(`/recebimento/cobranca/${p.pedido_id}`, { state: { from: "/recebimento/cobranca", fromLabel: "Fila de Cobrança" } })}
              >
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-xs font-medium text-primary">
                      {p.id_externo}
                    </span>
                    <BadgeLinkFila linha={linksFila?.[p.pedido_id]} />
                  </div>
                </TableCell>
                <TableCell>
                  <p className="text-sm font-medium">{p.parceiro_nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.parceiro_cnpj ? formatCNPJ(p.parceiro_cnpj) : "—"}
                  </p>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatBRL(p.valor_liquido)}
                </TableCell>
                <TableCell className="text-sm">{p.condicao_solicitada}</TableCell>
                <TableCell>
                  {p.perfil_aplicado ? (
                    <Badge variant="secondary" className="text-xs">
                      {p.perfil_aplicado}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {tempoNaFila(p.estagio_atualizado_em)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── CobrancaFila (hub principal com 3 tabs) ─────────────────────────────────

export default function CobrancaFila() {
  const { data: pedidos = [] } = useCobrancaFila();
  const { data: titulosCobranca = [] } = useTitulosCobranca();
  const { data: baixasPendentes } = useBaixasPendentes();
  const [tabAtiva, setTabAtiva] = useAbaUrl("mesa");
  const [subTabBanco, setSubTabBanco] = useState("remessas");

  const totalPedidos = pedidos.length;
  const totalTitulosAbertos = titulosCobranca.filter(
    (t) => t.status_gestao === "a_vencer" || t.status_gestao === "vence_hoje" || t.status_gestao === "atrasado",
  ).length;
  // Badge conta só o que exige AÇÃO NOSSA: aguardando gerar + aguardando envio.
  // Bloco "enviada aguardando retorno" fica fora — a bola está com o banco.
  const totalBaixasPend = baixasPendentes?.countAcoesNossas ?? 0;

  // Contagem AGIR AGORA da Mesa — mesma queryKey da Mesa, sem requisição extra.
  const mesaQ = useQuery({
    queryKey: ["cobranca-mesa"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("vw_cobranca_mesa").select("*");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const { data: reguaHoje = [] } = useReguaFilaHoje();
  const totalReguaHoje = reguaHoje.length;
  // Badge da Mesa: mesmo domínio da tela (`ehLinhaDaMesa`) — antes contava a
  // view crua e dizia "Mesa · 9" com 2 títulos visíveis.
  const totalAgirAgora = (mesaQ.data ?? [])
    .filter(ehLinhaDaMesa)
    .filter((l) => FILAS_AGIR_AGORA.includes(l.fila ?? "")).length;
  // Aba "Sem prova": mesma leitura da view, sem requisição extra.
  // COBRANCA-SEPARA-CLIENTE-DE-DEFEITO (02/09/2026): a aba deixou de ser so
  // "sem prova". O contador soma tudo que impede receber e nao e divida do
  // cliente. NAO_COBRAVEL fica FORA da contagem: e bloco informativo, nao
  // problema — contar regime proprio como problema inflaria o numero e treinaria
  // o operador a ignorar a aba.
  const FILAS_PROBLEMA_COBRANCA = [
    "PAGO_SEM_PROVA",
    "A_REEMITIR_BOLETO",
    "A_EMITIR_BOLETO",
    "EMAIL_BLOQUEADO",
    "A_ENVIAR",
  ];
  const totalSemProva = (mesaQ.data ?? []).filter(
    (l) =>
      FILAS_PROBLEMA_COBRANCA.includes(l.fila ?? "") ||
      (l.fila === "CONCILIAR" && l.instrumento === "cartao"),
  ).length;


  const tabTriggerCls =
    "rounded-none border-b-2 border-transparent bg-transparent px-1 pb-3 pt-1 text-muted-foreground data-[state=active]:text-gold data-[state=active]:border-gold data-[state=active]:shadow-none data-[state=active]:bg-transparent";
  const pillTriggerCls =
    "rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:border-foreground data-[state=active]:shadow-none";

  return (
    <PageShell>
      <div className="space-y-6">
      <CasaPageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "Recebimento", to: "/recebimento" },
          { label: "Cobrança" },
        ]}
        title="Cobrança"
        subtitle="Gestão de títulos, remessas bancárias e cobrança"
        actions={
          totalBaixasPend > 0 ? (
            <button
              type="button"
              onClick={() => setTabAtiva("banco")}
              className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning hover:bg-warning/20"
              title="Baixas pendentes — abrir aba Banco"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {totalBaixasPend} {totalBaixasPend === 1 ? "baixa pendente" : "baixas pendentes"}
            </button>
          ) : null
        }
      />

      <Tabs value={tabAtiva} onValueChange={setTabAtiva} className="space-y-4">
        <TabsList className="bg-transparent border-b border-border rounded-none w-full justify-start h-auto p-0 gap-6">
          {[
            { value: "mesa", label: `Mesa${totalAgirAgora > 0 ? ` · ${totalAgirAgora}` : ""}` },
            { value: "regua", label: `Régua${totalReguaHoje > 0 ? ` · ${totalReguaHoje}` : ""}` },
            {
              value: "sem-prova",
              label: `Problemas Cobrança${totalSemProva > 0 ? ` · ${totalSemProva}` : ""}`,
            },

            { value: "fila", label: `Fila${totalPedidos > 0 ? ` · ${totalPedidos}` : ""}` },
            { value: "titulos", label: `Títulos${totalTitulosAbertos > 0 ? ` · ${totalTitulosAbertos}` : ""}` },
            // aba Adiantamento s/ NF removida em 01/09/2026 — alarme coberto pelo motor de auditoria (pedido-sem-recebivel, pre-nf-sem-lastro, plano-cobranca-fora-do-liquido)
            { value: "banco", slug: "tela.cobranca_remessa", label: "Banco" },
          ].map((tab) => {
            const trigger = (
              <TabsTrigger value={tab.value} className={tabTriggerCls}>
                {tab.label}
              </TabsTrigger>
            );
            return tab.slug ? (
              <AbaPermitida key={tab.value} slug={tab.slug}>
                {trigger}
              </AbaPermitida>
            ) : (
              <Fragment key={tab.value}>{trigger}</Fragment>
            );
          })}
        </TabsList>

        <TabsContent value="mesa">
          <MesaCobranca
            onIrParaBanco={() => {
              setSubTabBanco("remessas");
              setTabAtiva("banco");
            }}
          />
        </TabsContent>

        <TabsContent value="regua">
          <ReguaTab />
        </TabsContent>

        <TabsContent value="sem-prova">
          <SemProvaTab />
        </TabsContent>


        <TabsContent value="fila">
          <Tabs defaultValue="materializacao" className="space-y-4">
            <TabsList className="bg-transparent p-0 h-auto gap-2">
              <TabsTrigger value="materializacao" className={pillTriggerCls}>
                Materialização
              </TabsTrigger>
              <TabsTrigger value="primeiro-pagamento" className={pillTriggerCls}>
                Primeiro Pagamento
              </TabsTrigger>
            </TabsList>
            <TabsContent value="materializacao">
              <PedidosCobrancaTab />
            </TabsContent>
            <TabsContent value="primeiro-pagamento">
              <PrimeiroPagamentoTab />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="titulos">
          {/* sub-aba Faturados removida em 01/09/2026 porque todo título vivo tem NF por construção (RECEBÍVEL-NASCE-PAREADO), então o filtro nunca divergia de Todos */}
          <TitulosTab />
        </TabsContent>

        {/* aba Adiantamento s/ NF removida em 01/09/2026 — alarme coberto pelo motor de auditoria (pedido-sem-recebivel, pre-nf-sem-lastro, plano-cobranca-fora-do-liquido) */}
        <TabsContent value="banco">
          <ConteudoAba slug="tela.cobranca_remessa">
            <Tabs value={subTabBanco} onValueChange={setSubTabBanco} className="space-y-4">
              <TabsList className="bg-transparent p-0 h-auto gap-2">
                <TabsTrigger value="remessas" className={pillTriggerCls}>
                  Remessas Safra
                </TabsTrigger>
                <TabsTrigger value="banco-safra" className={pillTriggerCls}>
                  Banco Safra
                </TabsTrigger>
              </TabsList>
              <TabsContent value="remessas">
                <RemessasSafraTab />
              </TabsContent>
              <TabsContent value="banco-safra">
                <BancoSafra onIrParaRemessas={() => setSubTabBanco("remessas")} />
              </TabsContent>
            </Tabs>
          </ConteudoAba>
        </TabsContent>

      </Tabs>
    </div>
    </PageShell>
  );
}

