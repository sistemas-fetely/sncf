import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addDays, format } from "date-fns";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePessoasSistema } from "@/hooks/tarefas/useTarefasCatalogos";
import { useAplicarTemplate, useTemplateItens, type Template } from "@/hooks/tarefas/useTemplates";

const SEM_VALOR = "__nenhum__";

function hojeISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

interface Props {
  template: Template | null;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
}

export function AplicarTemplateDialog({ template, aberto, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { data: itens, isLoading } = useTemplateItens(aberto ? template?.id ?? null : null);
  const { data: pessoas } = usePessoasSistema();
  const aplicar = useAplicarTemplate();

  const [nome, setNome] = useState("");
  const [dataInicio, setDataInicio] = useState(hojeISO());
  const [responsavel, setResponsavel] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setNome(template?.nome ?? "");
    setDataInicio(hojeISO());
    setResponsavel(null);
  }, [aberto, template]);

  const previa = useMemo(() => {
    const base = new Date(`${dataInicio}T00:00:00`);
    return (itens ?? []).map((i) => ({
      ...i,
      dataCalculada: format(addDays(base, i.dias_offset), "dd/MM/yyyy"),
    }));
  }, [itens, dataInicio]);

  const confirmar = () => {
    if (!template) return;
    aplicar.mutate(
      {
        templateId: template.id,
        nomeProjeto: nome.trim() || template.nome,
        dataInicio,
        responsavelPadrao: responsavel,
        projetoExistente: null,
      },
      {
        onSuccess: (projetoId) => {
          onOpenChange(false);
          if (projetoId) navigate(`/tarefas/projetos/${projetoId}`);
        },
      }
    );
  };

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Aplicar template</DialogTitle>
          <DialogDescription>
            Confira as tarefas e as datas já calculadas antes de criar o projeto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome do projeto</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Data de início</Label>
              <Input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value || hojeISO())}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Responsável padrão</Label>
              <Select
                value={responsavel ?? SEM_VALOR}
                onValueChange={(v) => setResponsavel(v === SEM_VALOR ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="Do item" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_VALOR}>Manter o do item</SelectItem>
                  {(pessoas ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Prévia ({previa.length} tarefa(s))</Label>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando itens…</p>
              ) : previa.length === 0 ? (
                <p className="text-sm text-muted-foreground">Este template não tem itens.</p>
              ) : (
                previa.map((i) => (
                  <div key={i.id} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="shrink-0 text-[10px]">{i.dataCalculada}</Badge>
                    <span className="min-w-0 flex-1 truncate">
                      {i.secao_nome ? <span className="text-muted-foreground">{i.secao_nome} · </span> : null}
                      {i.titulo}
                    </span>
                    {i.estimativa_horas != null && (
                      <span className="shrink-0 text-[11px] text-muted-foreground">{i.estimativa_horas}h</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={confirmar} disabled={aplicar.isPending || !template}>
            {aplicar.isPending ? "Aplicando…" : "Criar projeto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
