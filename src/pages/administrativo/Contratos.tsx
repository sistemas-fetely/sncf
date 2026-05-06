import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  FileSignature,
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FolderOpen,
  ArrowRight,
  Info,
  Trash2,
} from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

interface ContratoListagem {
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
  status: string;
  permite_valor_variavel: boolean;
  created_at: string;
  pasta_nome: string;
  pasta_tipo: string;
  parceiro_nome: string | null;
}

function KpiCard({
  label,
  value,
  icon: Icon,
  variant = "default",
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "default" | "warning" | "success";
}) {
  const colors = {
    default: "text-primary bg-primary/5",
    warning: "text-amber-600 bg-amber-50",
    success: "text-emerald-600 bg-emerald-50",
  };
  return (
    <div className="rounded-lg border p-4 bg-card">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <div className={`rounded-md p-1.5 ${colors[variant]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-2xl font-semibold mt-2">{value}</p>
    </div>
  );
}

export default function Contratos() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [contratoParaExcluir, setContratoParaExcluir] = useState<ContratoListagem | null>(null);

  const { data: contratos = [], isLoading } = useQuery({
    queryKey: ["contratos-todos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pasta_contratos")
        .select(`
          *,
          ged_pastas!inner(nome, tipo, parceiro_id, parceiros_comerciais(razao_social))
        `)
        .order("vigencia_inicio", { ascending: false });
      if (error) throw error;

      return (data ?? []).map((c: any) => ({
        ...c,
        pasta_nome: c.ged_pastas?.nome,
        pasta_tipo: c.ged_pastas?.tipo,
        parceiro_nome: c.ged_pastas?.parceiros_comerciais?.razao_social ?? null,
      })) as ContratoListagem[];
    },
  });

  const excluirMutation = useMutation({
    mutationFn: async (contrato: ContratoListagem) => {
      const { data: parcelas } = await (supabase as any)
        .from("pasta_contrato_parcelas")
        .select("id")
        .eq("pasta_contrato_id", contrato.id);

      const parcelaIds = (parcelas ?? []).map((p: any) => p.id);

      if (parcelaIds.length > 0) {
        const { error: cprErr } = await (supabase as any)
          .from("contas_pagar_receber")
          .update({ pasta_contrato_parcela_id: null })
          .in("pasta_contrato_parcela_id", parcelaIds);
        if (cprErr) throw new Error(`Erro ao desvincular parcelas: ${cprErr.message}`);
      }

      const { error } = await (supabase as any)
        .from("pasta_contratos")
        .delete()
        .eq("id", contrato.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contratos-todos"] });
      toast({ title: "Contrato excluído", description: "O contrato foi removido com sucesso." });
      setContratoParaExcluir(null);
    },
    onError: (err: Error) => {
      toast({
        title: "Erro ao excluir",
        description: err.message,
        variant: "destructive",
      });
      setContratoParaExcluir(null);
    },
  });

  const contratosFiltrados = contratos.filter((c) => {
    if (filtroStatus !== "todos" && c.status !== filtroStatus) return false;
    if (busca.trim()) {
      const q = busca.toLowerCase();
      return (
        c.numero?.toLowerCase().includes(q) ||
        c.pasta_nome?.toLowerCase().includes(q) ||
        c.parceiro_nome?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // KPIs
  const vigentes = contratos.filter((c) => c.status === "vigente");
  const valorMensal = vigentes.reduce((sum, c) => {
    if (c.ciclo_pagamento === "mensal") return sum + Number(c.valor_parcela);
    if (c.ciclo_pagamento === "trimestral") return sum + Number(c.valor_parcela) / 3;
    if (c.ciclo_pagamento === "anual") return sum + Number(c.valor_parcela) / 12;
    if (c.ciclo_pagamento === "parcelado") {
      if (c.vigencia_fim && c.vigencia_inicio) {
        const dias = Math.max(
          1,
          (new Date(c.vigencia_fim).getTime() - new Date(c.vigencia_inicio).getTime()) /
            (1000 * 60 * 60 * 24),
        );
        const meses = Math.max(1, Math.round(dias / 30.4));
        return sum + Number(c.valor_total) / meses;
      }
      return sum + Number(c.valor_parcela);
    }
    return sum;
  }, 0);

  const venceMes = vigentes.filter((c) => {
    if (!c.vigencia_fim) return false;
    const venc = new Date(c.vigencia_fim);
    const hoje = new Date();
    const diff = (venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);
    return diff > 0 && diff <= 30;
  });

  function statusBadge(s: string) {
    if (s === "vigente") return <Badge className="bg-green-100 text-green-700">Vigente</Badge>;
    if (s === "encerrado") return <Badge variant="secondary">Encerrado</Badge>;
    if (s === "futuro") return <Badge variant="outline">Futuro</Badge>;
    if (s === "suspenso") return <Badge className="bg-amber-100 text-amber-700">Suspenso</Badge>;
    if (s === "rascunho") return <Badge variant="outline">Rascunho</Badge>;
    return <Badge>{s}</Badge>;
  }

  function cicloLabel(c: ContratoListagem) {
    if (c.ciclo_pagamento === "unico") return "Único";
    if (c.ciclo_pagamento === "parcelado") return `${c.numero_parcelas}x parcelado`;
    if (c.ciclo_pagamento === "mensal") return "Mensal";
    if (c.ciclo_pagamento === "trimestral") return "Trimestral";
    if (c.ciclo_pagamento === "anual") return "Anual";
    return c.ciclo_pagamento;
  }

  return (
    <div className="container mx-auto py-6 max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contratos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visão consolidada de todos os contratos lógicos do sistema
          </p>
        </div>
      </div>

      {/* Banner: como criar contrato novo */}
      <div className="rounded-lg border bg-blue-50 border-blue-200 p-4 flex items-start gap-3">
        <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="flex-1 text-sm">
          <p className="font-medium text-blue-900">Para criar um novo contrato</p>
          <p className="text-blue-700 mt-0.5">
            Os contratos nascem do GED. Crie uma pasta/projeto, suba os documentos
            (contrato, propostas, orçamentos) e clique em "Gerar contrato com IA".
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/administrativo-fetely/ged")}
          className="shrink-0"
        >
          Ir para o GED
          <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard label="Total" value={contratos.length} icon={FileSignature} />
        <KpiCard label="Vigentes" value={vigentes.length} icon={CheckCircle2} variant="success" />
        <KpiCard label="Valor mensal estimado" value={formatBRL(valorMensal)} icon={Clock} />
        <KpiCard label="Vencem em 30 dias" value={venceMes.length} icon={AlertTriangle} variant="warning" />
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número, projeto ou parceiro..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="vigente">Vigentes</SelectItem>
            <SelectItem value="futuro">Futuros</SelectItem>
            <SelectItem value="suspenso">Suspensos</SelectItem>
            <SelectItem value="encerrado">Encerrados</SelectItem>
            <SelectItem value="rascunho">Rascunhos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {isLoading && (
          <div className="text-center py-12 text-muted-foreground text-sm">Carregando...</div>
        )}

        {!isLoading && contratosFiltrados.length === 0 && (
          <div className="text-center py-12">
            <FileSignature className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">
              {contratos.length === 0
                ? "Nenhum contrato cadastrado ainda."
                : "Nenhum contrato encontrado com esses filtros."}
            </p>
            {contratos.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/administrativo-fetely/ged")}
                className="mt-4"
              >
                Criar primeiro contrato no GED
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            )}
          </div>
        )}

        {!isLoading && contratosFiltrados.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Projeto / Parceiro</TableHead>
                <TableHead>Ciclo</TableHead>
                <TableHead className="text-right">Valor parcela</TableHead>
                <TableHead className="text-right">Valor total</TableHead>
                <TableHead>Vigência</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contratosFiltrados.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => navigate(`/administrativo-fetely/ged?pasta=${c.pasta_id}`)}
                >
                  <TableCell className="font-mono text-xs">{c.numero}</TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{c.pasta_nome}</p>
                      {c.parceiro_nome && (
                        <p className="text-xs text-muted-foreground">{c.parceiro_nome}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{cicloLabel(c)}</span>
                      {c.permite_valor_variavel && (
                        <Badge variant="outline" className="text-xs">SaaS variável</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {formatBRL(c.valor_parcela)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {formatBRL(c.valor_total)}
                  </TableCell>
                  <TableCell className="text-xs">
                    <div>{formatDateBR(c.vigencia_inicio)}</div>
                    <div className="text-muted-foreground">
                      → {c.vigencia_fim ? formatDateBR(c.vigencia_fim) : "sem fim"}
                    </div>
                  </TableCell>
                  <TableCell>{statusBadge(c.status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/administrativo-fetely/ged?pasta=${c.pasta_id}`);
                        }}
                        title="Abrir no GED"
                      >
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setContratoParaExcluir(c);
                        }}
                        title="Excluir contrato"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <AlertDialog
        open={!!contratoParaExcluir}
        onOpenChange={(open) => { if (!open) setContratoParaExcluir(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contrato?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Você está prestes a excluir o contrato{" "}
                  <span className="font-mono font-medium">{contratoParaExcluir?.numero}</span> do projeto{" "}
                  <span className="font-medium">{contratoParaExcluir?.pasta_nome}</span>.
                </p>
                <p className="text-amber-700">
                  ⚠️ As parcelas do contrato serão removidas. Despesas já lançadas em Contas a Pagar
                  serão mantidas, mas perderão o vínculo com este contrato.
                </p>
                <p className="font-medium">Esta ação não pode ser desfeita.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => contratoParaExcluir && excluirMutation.mutate(contratoParaExcluir)}
              disabled={excluirMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {excluirMutation.isPending ? "Excluindo..." : "Excluir contrato"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
