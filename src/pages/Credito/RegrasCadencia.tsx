import { useState } from "react";
import { Plus, Pencil, Trash2, Settings2 } from "lucide-react";
import { useRegrasCadencia } from "@/hooks/credito/useRegrasCadencia";
import { useToggleRegraCadencia } from "@/hooks/credito/useToggleRegraCadencia";
import {
  useExcluirRegraCadencia,
  useContarAnalisesPorRegra,
} from "@/hooks/credito/useExcluirRegraCadencia";
import { RegraCadenciaDialog } from "@/components/credito/RegraCadenciaDialog";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatBRL } from "@/lib/format-currency";
import type { RegraCadencia, RegraCadenciaCriterio } from "@/types/credito";

const PERFIL_LABEL: Record<string, string> = {
  novo_entrada: "Novo",
  novo_qualificado: "Novo qualif.",
  recorrente_bom_pagador: "Recorrente",
  premium: "Premium",
  bandeira_vermelha: "Bandeira",
};

function resumirCriterio(c: RegraCadenciaCriterio): string {
  const partes: string[] = [];
  if (c.perfil_in?.length)
    partes.push(`perfil ${c.perfil_in.map((p) => PERFIL_LABEL[p] ?? p).join("|")}`);
  if (c.valor_max !== undefined) partes.push(`≤ ${formatCurrency(c.valor_max)}`);
  if (c.sem_bandeira) partes.push("sem bandeira");
  if (c.titulos_pagos_no_prazo_min !== undefined)
    partes.push(`min ${c.titulos_pagos_no_prazo_min} pagos`);
  return partes.length ? partes.join(" · ") : "—";
}

export default function RegrasCadencia() {
  const { data, isLoading } = useRegrasCadencia();
  const toggle = useToggleRegraCadencia();
  const excluir = useExcluirRegraCadencia();
  const contar = useContarAnalisesPorRegra();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<RegraCadencia | null>(null);
  const [confirmExclusao, setConfirmExclusao] = useState<{
    regra: RegraCadencia;
    count: number;
  } | null>(null);

  const novaRegra = () => {
    setEditando(null);
    setDialogOpen(true);
  };
  const editar = (r: RegraCadencia) => {
    setEditando(r);
    setDialogOpen(true);
  };

  const pedirExclusao = async (r: RegraCadencia) => {
    const count = await contar.mutateAsync(r.id);
    setConfirmExclusao({ regra: r, count });
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 animate-casa-fade-in">
      <CasaPageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "Crédito", to: "/credito" },
          { label: "Regras de cadência" },
        ]}
        title="Regras de cadência da análise"
        subtitle="Pré-aprovação automática · admin (Joseph)"
        actions={
          <Button onClick={novaRegra} className="gap-2">
            <Plus className="h-4 w-4" /> Nova regra
          </Button>
        }
      />

      <div className="border rounded-lg bg-card">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Settings2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              Nenhuma regra cadastrada — análises não terão pré-aprovação automática
            </p>
            <Button onClick={novaRegra} variant="outline" size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Criar primeira regra
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Ativa</TableHead>
                <TableHead className="w-[80px]">Ordem</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Critério</TableHead>
                <TableHead className="w-[120px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow key={r.id} className={r.ativa ? "" : "opacity-60"}>
                  <TableCell>
                    <Switch
                      checked={r.ativa}
                      disabled={toggle.isPending}
                      onCheckedChange={(v) => toggle.mutate({ id: r.id, ativa: v })}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.ordem}</Badge>
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => editar(r)}
                      className="text-left hover:underline font-medium"
                    >
                      {r.nome}
                    </button>
                    {r.descricao && (
                      <p className="text-xs text-muted-foreground mt-0.5">{r.descricao}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {resumirCriterio(r.criterio)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => editar(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => pedirExclusao(r)}
                        className="text-destructive hover:text-destructive"
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

      <RegraCadenciaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        regra={editando}
      />

      <AlertDialog
        open={!!confirmExclusao}
        onOpenChange={(o) => !o && setConfirmExclusao(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir regra?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmExclusao?.count
                ? `${confirmExclusao.count} análise(s) já usaram essa regra — excluir mesmo assim? O histórico de pré-aprovação permanece, mas o vínculo será removido.`
                : "Essa regra ainda não foi aplicada em nenhuma análise."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmExclusao) {
                  excluir.mutate(confirmExclusao.regra.id);
                  setConfirmExclusao(null);
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
