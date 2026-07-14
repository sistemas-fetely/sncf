import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useCobrancaFila } from "@/hooks/credito/useCobrancaFila";
import { useTitulosBoleto } from "@/hooks/credito/useTitulosBoleto";
import { useRemessasSafra } from "@/hooks/credito/useRemessasSafra";
import BancoSafra from "@/pages/administrativo/BancoSafra";
import PrimeiroPagamentoTab from "@/pages/Credito/PrimeiroPagamentoTab";
import TitulosTab from "@/pages/Credito/TitulosTab";
import ReguaTab from "@/pages/Credito/ReguaTab";

import CreditoClientesIndex from "@/pages/Credito/CreditoClientesIndex";
import { BadgeBoletoStatus } from "@/components/credito/BadgeBoletoStatus";
import { useTitulosCobranca } from "@/hooks/credito/useTitulosCobranca";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  Search, FileDown, Upload, CheckCircle2, XCircle, Clock,
  AlertTriangle, FileText, RefreshCw,
} from "lucide-react";
import { formatCNPJ } from "@/lib/cnpj";
import { formatBRL } from "@/lib/format-currency";
import { supabase } from "@/integrations/supabase/client";
import type { TituloBoletoPendente, ValidacaoRemessa, BoletoStatus, ResultadoRetorno } from "@/types/credito";

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
    { key: "remessa_gerada", label: "Remessa gerada", color: "bg-amber-400" },
    { key: "registrado", label: "Registrado", color: "bg-emerald-500" },
    { key: "rejeitado", label: "Rejeitado", color: "bg-red-500" },
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
                <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{v.parceiro_nome}</p>
                <p className="text-xs text-muted-foreground">
                  {v.numero_titulo} · {v.numero_parcela}/{v.total_parcelas} ·{" "}
                  {formatBRL(v.valor_bruto)} · venc {fmtDate(v.data_vencimento)}
                </p>
                {!v.valido && v.motivo_bloqueio && (
                  <p className="text-xs text-red-600 mt-1">{v.motivo_bloqueio}</p>
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).functions.invoke(
        "processar-retorno-safra",
        { body: { arquivo_conteudo: texto } }
      );
      if (error) throw error;
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
              <div className="p-4 rounded-md border bg-emerald-50 text-center">
                <p className="text-2xl font-semibold text-emerald-700">{resultado.confirmados}</p>
                <p className="text-xs text-emerald-700">Confirmados</p>
              </div>
              <div className="p-4 rounded-md border bg-red-50 text-center">
                <p className="text-2xl font-semibold text-red-700">{resultado.rejeitados}</p>
                <p className="text-xs text-red-700">Rejeitados</p>
              </div>
              <div className="p-4 rounded-md border bg-blue-50 text-center">
                <p className="text-2xl font-semibold text-blue-700">{resultado.emails_enviados}</p>
                <p className="text-xs text-blue-700">E-mails enviados</p>
              </div>
            </div>

            {resultado.detalhes_rejeicao.length > 0 && (
              <div className="space-y-2 max-h-[300px] overflow-auto">
                <p className="text-sm font-medium">Títulos rejeitados:</p>
                {resultado.detalhes_rejeicao.map((r, i) => (
                  <div key={i} className="p-3 rounded-md border bg-red-50/50">
                    <p className="text-sm font-medium">
                      {r.parceiro_nome} · {r.numero_titulo}
                    </p>
                    <p className="text-xs text-red-700">
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
                  Nenhum título boleto encontrado.
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
        onSuccess={() => {
          setSelecionados(new Set());
          qc.invalidateQueries({ queryKey: ["titulos-boleto"] });
          qc.invalidateQueries({ queryKey: ["remessas-safra"] });
        }}
      />
    </div>
  );
}

// ─── Tab 3: Remessas ─────────────────────────────────────────────────────────

function RemessasSafraTab() {
  const [importarOpen, setImportarOpen] = useState(false);
  const [baixandoId, setBaixandoId] = useState<string | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: remessas = [], isLoading } = useRemessasSafra();

  async function baixarNovamente(remessaId: string, arquivoNome: string) {
    setBaixandoId(remessaId);
    try {
      const { data, error } = await supabase.functions.invoke("baixar-remessa-safra", {
        body: { remessa_id: remessaId },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.erro || "Falha ao gerar arquivo");
      const blob = new Blob([data.arquivo_conteudo], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.arquivo_nome || arquivoNome;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Arquivo baixado", description: arquivoNome });
    } catch (e) {
      toast({
        title: "Erro ao baixar remessa",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setBaixandoId(null);
    }
  }

  const statusMap: Record<string, { label: string; className: string }> = {
    gerada: { label: "Gerada", className: "bg-amber-50 text-amber-700 border border-amber-200" },
    enviada: { label: "Enviada", className: "bg-blue-50 text-blue-700 border border-blue-200" },
    processada: {
      label: "Processada",
      className: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    },
    com_rejeicoes: {
      label: "Com rejeições",
      className: "bg-red-50 text-red-700 border border-red-200",
    },
  };


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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Arquivo</TableHead>
              <TableHead>Gerada em</TableHead>
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
                <TableCell colSpan={7} className="py-6">
                  <Skeleton className="h-10 w-full" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && remessas.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Nenhuma remessa gerada ainda.
                </TableCell>
              </TableRow>
            )}
            {remessas.map((r) => {
              const s = statusMap[r.status] ?? statusMap.gerada;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.arquivo_nome}</TableCell>
                  <TableCell className="text-sm">{fmtDateTime(r.gerado_em)}</TableCell>
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
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={baixandoId === r.id}
                      onClick={() => baixarNovamente(r.id, r.arquivo_nome)}
                    >
                      <FileDown className="h-3.5 w-3.5 mr-1.5" />
                      {baixandoId === r.id ? "Baixando..." : "Baixar"}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}

          </TableBody>
        </Table>
      </div>

      <ImportarRetornoModal
        open={importarOpen}
        onClose={() => setImportarOpen(false)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ["remessas-safra"] });
          qc.invalidateQueries({ queryKey: ["titulos-boleto"] });
        }}
      />
    </div>
  );
}

// ─── Tab 1: Pedidos (comportamento original) ─────────────────────────────────

function PedidosCobrancaTab() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const { data, isLoading } = useCobrancaFila({ busca: busca || undefined });
  const total = data?.length ?? 0;

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
                onClick={() => navigate(`/recebimento/cobranca/${p.pedido_id}`)}
              >
                <TableCell>
                  <span className="font-mono text-xs font-semibold text-primary">
                    {p.id_externo}
                  </span>
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

  const totalPedidos = pedidos.length;
  const totalTitulosAbertos = titulosCobranca.filter(
    (t) => t.status_gestao === "a_vencer" || t.status_gestao === "vence_hoje" || t.status_gestao === "atrasado",
  ).length;

  const tabTriggerCls =
    "rounded-none border-b-2 border-transparent bg-transparent px-1 pb-3 pt-1 text-muted-foreground data-[state=active]:text-gold data-[state=active]:border-gold data-[state=active]:shadow-none data-[state=active]:bg-transparent";
  const pillTriggerCls =
    "rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:border-foreground data-[state=active]:shadow-none";

  return (
    <div className="space-y-6">
      <CasaPageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "Recebimento", to: "/recebimento" },
          { label: "Cobrança" },
        ]}
        title="Cobrança"
        subtitle="Gestão de títulos, remessas bancárias e cobrança"
      />

      <Tabs defaultValue="fila" className="space-y-4">
        <TabsList className="bg-transparent border-b border-border rounded-none w-full justify-start h-auto p-0 gap-6">
          {[
            { value: "fila", label: `Fila${totalPedidos > 0 ? ` · ${totalPedidos}` : ""}` },
            { value: "titulos", label: `Títulos${totalTitulosAbertos > 0 ? ` · ${totalTitulosAbertos}` : ""}` },
            { value: "regua", label: "Régua" },
            { value: "banco", label: "Banco" },
            { value: "credito-cliente", label: "Crédito do cliente" },
          ].map((tab) => (

            <TabsTrigger key={tab.value} value={tab.value} className={tabTriggerCls}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

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
          <TitulosTab />
        </TabsContent>

        <TabsContent value="banco">
          <Tabs defaultValue="remessas" className="space-y-4">
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
              <BancoSafra />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="credito-cliente">
          <CreditoClientesIndex />
        </TabsContent>
      </Tabs>
    </div>
  );
}

