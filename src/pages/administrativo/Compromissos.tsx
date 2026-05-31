import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Search,
  Repeat,
  CreditCard,
  FileText,
  Pause,
  Play,
  StopCircle,
  XCircle,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { useCategoriasPlano } from "@/hooks/useCategoriasPlano";
import { cancelarCompromisso } from "@/lib/financeiro/compromissos-handler";
import DialogNovoRecorrente from "@/components/financeiro/DialogNovoRecorrente";
import DialogNovoParceladoManual from "@/components/financeiro/DialogNovoParceladoManual";

// =====================================================
// Types
// =====================================================
type CompromissoRecorrente = {
  id: string;
  descricao: string;
  valor: number;
  periodicidade: "mensal" | "trimestral" | "anual";
  dia_vencimento: number;
  data_inicio: string;
  data_fim: string | null;
  status: "ativo" | "pausado" | "encerrado";
  plano_contas_id: string | null;
  parceiro_id: string | null;
  conta_bancaria_id: string | null;
  observacao: string | null;
  parceiro?: { razao_social: string } | null;
  conta_bancaria?: { nome_exibicao: string } | null;
};

type CompromissoParcelado = {
  id: string;
  descricao: string;
  origem: string;
  valor_total: number;
  valor_parcela: number;
  qtd_parcelas: number;
  parcelas_pagas: number;
  parcelas_previstas: number;
  data_compra: string;
  data_primeira_parcela: string;
  status: string;
  plano_contas_id: string | null;
  conta_bancaria?: { nome_exibicao: string } | null;
};

const PERIODICIDADE_LABEL: Record<string, string> = {
  mensal: "Mensal",
  trimestral: "Trimestral",
  anual: "Anual",
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  ativo: { label: "Ativo", className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  pausado: { label: "Pausado", className: "bg-amber-100 text-amber-800 border-amber-300" },
  encerrado: { label: "Encerrado", className: "bg-muted text-muted-foreground" },
  cancelado: { label: "Cancelado", className: "bg-muted text-muted-foreground" },
};

const ORIGEM_ICON: Record<string, { icon: typeof CreditCard; label: string; cor: string }> = {
  cartao: { icon: CreditCard, label: "Cartão", cor: "text-violet-600" },
  boleto: { icon: FileText, label: "Boleto", cor: "text-amber-600" },
  manual: { icon: FileText, label: "Manual", cor: "text-slate-600" },
};

// =====================================================
// Componente
// =====================================================
export default function Compromissos() {
  const qc = useQueryClient();
  const { data: categoriasMap } = useCategoriasPlano();
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [dialogRecorrenteAberto, setDialogRecorrenteAberto] = useState(false);
  const [dialogParceladoAberto, setDialogParceladoAberto] = useState(false);
  const [recorrenteEditando, setRecorrenteEditando] = useState<CompromissoRecorrente | null>(null);

  const mapCategorias = useMemo(() => {
    const m: Record<string, string> = {};
    (categoriasMap || []).forEach((c) => {
      m[c.id] = `${c.codigo} ${c.nome}`;
    });
    return m;
  }, [categoriasMap]);

  // Recorrentes
  const { data: recorrentes, isLoading: loadingRec } = useQuery({
    queryKey: ["compromissos-recorrentes"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("compromissos_recorrentes")
        .select(`
          id, descricao, valor, periodicidade, dia_vencimento,
          data_inicio, data_fim, status, plano_contas_id, parceiro_id,
          conta_bancaria_id, observacao,
          parceiro:parceiros_comerciais(razao_social),
          conta_bancaria:contas_bancarias(nome_exibicao)
        `)
        .order("status", { ascending: true })
        .order("descricao", { ascending: true });
      if (error) throw error;
      return (data || []) as CompromissoRecorrente[];
    },
  });

  // Parcelados
  const { data: parcelados, isLoading: loadingParc } = useQuery({
    queryKey: ["compromissos-parcelados-lista"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compromissos_parcelados")
        .select(`
          id, descricao, origem, valor_total, valor_parcela, qtd_parcelas,
          parcelas_pagas, parcelas_previstas, data_compra, data_primeira_parcela,
          status, plano_contas_id,
          conta_bancaria:contas_bancarias(nome_exibicao)
        `)
        .order("data_compra", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as CompromissoParcelado[];
    },
  });

  // Filtros aplicados
  const recorrentesFiltrados = useMemo(() => {
    return (recorrentes || []).filter((r) => {
      const matchBusca =
        !busca || r.descricao.toLowerCase().includes(busca.toLowerCase());
      const matchStatus = filtroStatus === "todos" || r.status === filtroStatus;
      return matchBusca && matchStatus;
    });
  }, [recorrentes, busca, filtroStatus]);

  const parceladosFiltrados = useMemo(() => {
    return (parcelados || []).filter((p) => {
      const matchBusca =
        !busca || p.descricao.toLowerCase().includes(busca.toLowerCase());
      const matchStatus =
        filtroStatus === "todos" || p.status === filtroStatus;
      return matchBusca && matchStatus;
    });
  }, [parcelados, busca, filtroStatus]);

  // Ações de recorrente
  async function alterarStatusRecorrente(
    id: string,
    novoStatus: "ativo" | "pausado" | "encerrado",
  ) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("compromissos_recorrentes")
        .update({ status: novoStatus })
        .eq("id", id);
      if (error) throw error;

      // Se pausou ou encerrou, cancela parcelas futuras
      if (novoStatus !== "ativo") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).rpc("cancelar_parcelas_futuras_recorrente", {
          p_recorrente_id: id,
        });
      } else {
        // Reativou: regera previsões
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).rpc("gerar_parcelas_recorrentes", {
          p_recorrente_id: id,
          p_meses_a_frente: 12,
        });
      }

      toast.success(`Recorrente ${novoStatus === "ativo" ? "reativado" : novoStatus}`);
      qc.invalidateQueries({ queryKey: ["compromissos-recorrentes"] });
      qc.invalidateQueries({ queryKey: ["fluxo-caixa-futuro"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar status");
    }
  }

  async function cancelarParcelado(id: string) {
    try {
      await cancelarCompromisso(id);
      toast.success("Parcelado cancelado");
      qc.invalidateQueries({ queryKey: ["compromissos-parcelados-lista"] });
      qc.invalidateQueries({ queryKey: ["fluxo-caixa-futuro"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao cancelar");
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Repeat className="h-6 w-6 text-primary" />
            Contratos Recorrentes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Obrigações financeiras recorrentes e parceladas. Geram parcelas
            previstas no fluxo de caixa futuro.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setDialogParceladoAberto(true)}
            className="gap-1"
          >
            <Plus className="h-4 w-4" />
            Parcelado Manual
          </Button>
          <Button
            onClick={() => {
              setRecorrenteEditando(null);
              setDialogRecorrenteAberto(true);
            }}
            className="gap-1"
          >
            <Plus className="h-4 w-4" />
            Novo Recorrente
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por descrição..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="pausado">Pausado</SelectItem>
            <SelectItem value="encerrado">Encerrado</SelectItem>
            <SelectItem value="cancelado">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Abas */}
      <Tabs defaultValue="recorrentes">
        <TabsList>
          <TabsTrigger value="recorrentes" className="gap-1">
            <Repeat className="h-3.5 w-3.5" />
            Recorrentes ({recorrentesFiltrados.length})
          </TabsTrigger>
          <TabsTrigger value="parcelados" className="gap-1">
            <CreditCard className="h-3.5 w-3.5" />
            Parcelados ({parceladosFiltrados.length})
          </TabsTrigger>
        </TabsList>

        {/* TAB RECORRENTES */}
        <TabsContent value="recorrentes">
          <Card>
            <CardContent className="pt-4">
              {loadingRec ? (
                <Skeleton className="h-32 w-full" />
              ) : recorrentesFiltrados.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Repeat className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">
                    {busca || filtroStatus !== "todos"
                      ? "Nenhum recorrente com esses filtros"
                      : "Nenhum compromisso recorrente cadastrado"}
                  </p>
                  {!busca && filtroStatus === "todos" && (
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => setDialogRecorrenteAberto(true)}
                      className="mt-2"
                    >
                      Criar primeiro recorrente
                    </Button>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Periodicidade</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Vigência</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recorrentesFiltrados.map((r) => {
                      const statusInfo = STATUS_BADGE[r.status] || STATUS_BADGE.ativo;
                      return (
                        <TableRow
                          key={r.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => {
                            setRecorrenteEditando(r);
                            setDialogRecorrenteAberto(true);
                          }}
                        >
                          <TableCell>
                            <div className="font-medium">{r.descricao}</div>
                            {r.parceiro?.razao_social && (
                              <div className="text-xs text-muted-foreground">
                                {r.parceiro.razao_social}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {PERIODICIDADE_LABEL[r.periodicidade]}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            {formatBRL(r.valor)}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">Dia {r.dia_vencimento}</span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDateBR(r.data_inicio)}
                            </div>
                            {r.data_fim && (
                              <div className="text-[10px]">
                                até {formatDateBR(r.data_fim)}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.plano_contas_id ? mapCategorias[r.plano_contas_id] : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-xs ${statusInfo.className}`}
                            >
                              {statusInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell
                            className="text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex gap-1 justify-end">
                              {r.status === "ativo" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="Pausar"
                                  onClick={() => alterarStatusRecorrente(r.id, "pausado")}
                                >
                                  <Pause className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {r.status === "pausado" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="Reativar"
                                  onClick={() => alterarStatusRecorrente(r.id, "ativo")}
                                >
                                  <Play className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {r.status !== "encerrado" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="Encerrar"
                                  onClick={() =>
                                    alterarStatusRecorrente(r.id, "encerrado")
                                  }
                                >
                                  <StopCircle className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB PARCELADOS */}
        <TabsContent value="parcelados">
          <Card>
            <CardContent className="pt-4">
              {loadingParc ? (
                <Skeleton className="h-32 w-full" />
              ) : parceladosFiltrados.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CreditCard className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">
                    {busca || filtroStatus !== "todos"
                      ? "Nenhum parcelado com esses filtros"
                      : "Nenhum compromisso parcelado"}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Valor Total</TableHead>
                      <TableHead>Parcela</TableHead>
                      <TableHead>Progresso</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parceladosFiltrados.map((p) => {
                      const statusInfo = STATUS_BADGE[p.status] || STATUS_BADGE.ativo;
                      const origemInfo = ORIGEM_ICON[p.origem] || ORIGEM_ICON.manual;
                      const Icon = origemInfo.icon;
                      const progresso =
                        p.qtd_parcelas > 0
                          ? Math.round((p.parcelas_pagas / p.qtd_parcelas) * 100)
                          : 0;
                      return (
                        <TableRow key={p.id}>
                          <TableCell>
                            <div className="font-medium">{p.descricao}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatDateBR(p.data_compra)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div
                              className={`flex items-center gap-1 text-xs ${origemInfo.cor}`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              {origemInfo.label}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">
                            {formatBRL(p.valor_total)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatBRL(p.valor_parcela)} × {p.qtd_parcelas}
                          </TableCell>
                          <TableCell>
                            <div className="text-xs space-y-1">
                              <div>
                                {p.parcelas_pagas} pagas · {p.parcelas_previstas}{" "}
                                previstas
                              </div>
                              <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                                <div
                                  className="bg-emerald-500 h-full"
                                  style={{ width: `${progresso}%` }}
                                />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {p.plano_contas_id ? mapCategorias[p.plano_contas_id] : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-xs ${statusInfo.className}`}
                            >
                              {statusInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {p.status === "ativo" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Cancelar compromisso"
                                onClick={() => cancelarParcelado(p.id)}
                              >
                                <XCircle className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <DialogNovoRecorrente
        aberto={dialogRecorrenteAberto}
        onFechar={() => {
          setDialogRecorrenteAberto(false);
          setRecorrenteEditando(null);
        }}
        recorrenteEditando={recorrenteEditando}
      />
      <DialogNovoParceladoManual
        aberto={dialogParceladoAberto}
        onFechar={() => setDialogParceladoAberto(false)}
      />
    </div>
  );
}
