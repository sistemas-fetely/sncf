/**
 * GruposLista — conteúdo da aba "Grupos" em /administrativo/parceiros.
 *
 * KPIs + filtros + tabela de grupos com ações de editar/excluir.
 * Consome useGruposEmpresariais + useExposicaoPorGrupo.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import {
  GrupoEmpresarial,
  TipoControle,
  TIPO_CONTROLE_LABELS,
  TIPO_CONTROLE_BADGE,
  useGruposEmpresariais,
  useExcluirOuInativarGrupo,
} from "@/hooks/useGruposEmpresariais";
import { useExposicaoPorGrupo } from "@/hooks/useExposicaoPorGrupo";
import { GrupoFormSheet } from "./GrupoFormSheet";
import { formatBRL } from "@/lib/format-currency";

const TIPO_OPCOES: TipoControle[] = [
  "holding_formal",
  "mesmo_dono",
  "controle_indireto",
  "agrupamento_operacional",
  "outro",
];

export function GruposLista() {
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroStatus, setFiltroStatus] = useState<string>("ativos");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GrupoEmpresarial | null>(null);
  const [grupoParaExcluir, setGrupoParaExcluir] = useState<GrupoEmpresarial | null>(null);

  // Para listagem completa (com inativos), buscamos todos
  const { data: grupos = [], isLoading: loadingGrupos } = useGruposEmpresariais(false);
  const { data: exposicao = [], isLoading: loadingExp } = useExposicaoPorGrupo();
  const excluir = useExcluirOuInativarGrupo();

  const isLoading = loadingGrupos || loadingExp;

  const expoMap = useMemo(() => {
    const m = new Map<string, (typeof exposicao)[number]>();
    for (const e of exposicao) m.set(e.grupo_id, e);
    return m;
  }, [exposicao]);

  const kpis = useMemo(() => {
    const ativos = grupos.filter((g) => g.ativo);
    let maior: { nome: string; qtd: number } = { nome: "—", qtd: 0 };
    let despesaTotal = 0;
    for (const e of exposicao) {
      if (e.qtd_parceiros_ativos > maior.qtd) {
        maior = { nome: e.grupo_nome, qtd: e.qtd_parceiros_ativos };
      }
      despesaTotal += Number(e.total_pagar_12m || 0);
    }
    return {
      totalAtivos: ativos.length,
      maior,
      despesa12m: despesaTotal,
    };
  }, [grupos, exposicao]);

  const filtered = useMemo(() => {
    let list = grupos;
    if (filtroStatus === "ativos") list = list.filter((g) => g.ativo);
    else if (filtroStatus === "inativos") list = list.filter((g) => !g.ativo);

    if (filtroTipo !== "todos") {
      list = list.filter((g) => g.tipo_controle === filtroTipo);
    }
    if (busca.trim()) {
      const t = busca.toLowerCase();
      list = list.filter((g) => g.nome.toLowerCase().includes(t));
    }
    return list;
  }, [grupos, filtroStatus, filtroTipo, busca]);

  function handleNovo() {
    setEditing(null);
    setFormOpen(true);
  }

  function handleEdit(g: GrupoEmpresarial) {
    setEditing(g);
    setFormOpen(true);
  }

  async function handleConfirmExcluir() {
    if (!grupoParaExcluir) return;
    try {
      await excluir.mutateAsync(grupoParaExcluir.id);
      setGrupoParaExcluir(null);
    } catch {
      // toast via hook
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">
              Total de grupos ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-medium">{kpis.totalAtivos}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">
              Maior grupo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-medium truncate">{kpis.maior.nome}</div>
            <div className="text-xs text-muted-foreground">
              ({kpis.maior.qtd} parceiro{kpis.maior.qtd === 1 ? "" : "s"})
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">
              Despesa total 12m
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-medium">{formatBRL(kpis.despesa12m)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="w-full lg:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                {TIPO_OPCOES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TIPO_CONTROLE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-full lg:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ativos">Ativos</SelectItem>
                <SelectItem value="inativos">Inativos</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={handleNovo}
              className="gap-2 bg-admin hover:bg-admin/90 text-admin-foreground"
            >
              <Plus className="h-4 w-4" />
              Novo grupo
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhum grupo cadastrado.
            </div>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="w-44">Tipo de controle</TableHead>
                    <TableHead className="w-28 text-center">Parceiros</TableHead>
                    <TableHead className="w-32 text-right">Despesa 12m</TableHead>
                    <TableHead className="w-32 text-right">Receita 12m</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((g) => {
                    const exp = expoMap.get(g.id);
                    const tipo = g.tipo_controle as TipoControle | null;
                    const despesa = Number(exp?.total_pagar_12m || 0);
                    const receita = Number(exp?.total_receber_12m || 0);
                    return (
                      <TableRow
                        key={g.id}
                        className="cursor-pointer"
                        onClick={() => handleEdit(g)}
                      >
                        <TableCell>
                          <div className="font-medium">{g.nome}</div>
                          {g.descricao && (
                            <div className="text-xs text-muted-foreground truncate max-w-md">
                              {g.descricao}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {tipo ? (
                            <Badge className={TIPO_CONTROLE_BADGE[tipo]}>
                              {TIPO_CONTROLE_LABELS[tipo]}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {exp
                            ? `${exp.qtd_parceiros_ativos} / ${exp.qtd_parceiros_total}`
                            : "0 / 0"}
                        </TableCell>
                        <TableCell className="text-right">
                          {despesa > 0 ? (
                            formatBRL(despesa)
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {receita > 0 ? (
                            formatBRL(receita)
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {g.ativo ? (
                            <Badge className="bg-[#1A4A3A] text-white hover:bg-[#1A4A3A]">
                              Ativo
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Inativo</Badge>
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEdit(g)}
                              title="Editar grupo"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setGrupoParaExcluir(g)}
                              title="Excluir grupo"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <GrupoFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
      />

      <AlertDialog
        open={!!grupoParaExcluir}
        onOpenChange={(v) => {
          if (!v) setGrupoParaExcluir(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir grupo?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a excluir <strong>{grupoParaExcluir?.nome}</strong>.
              Se este grupo tiver parceiros vinculados, ele será apenas
              inativado (preserva o histórico). Caso contrário, será excluído
              permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluir.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmExcluir();
              }}
              disabled={excluir.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {excluir.isPending ? "Processando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
