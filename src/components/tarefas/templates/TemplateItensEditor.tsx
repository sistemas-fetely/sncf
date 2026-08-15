import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePessoasSistema } from "@/hooks/tarefas/useTarefasCatalogos";
import {
  useExcluirTemplateItem, useSalvarTemplateItem, useTemplateItens, type TemplateItem,
} from "@/hooks/tarefas/useTemplates";

const SEM_VALOR = "__nenhum__";

interface Props {
  templateId: string;
}

export function TemplateItensEditor({ templateId }: Props) {
  const { data: itens, isLoading, error } = useTemplateItens(templateId);
  const salvar = useSalvarTemplateItem(templateId);
  const excluir = useExcluirTemplateItem(templateId);
  const { data: pessoas } = usePessoasSistema();

  const [titulo, setTitulo] = useState("");
  const [secao, setSecao] = useState("");
  const [prioridade, setPrioridade] = useState("media");
  const [offset, setOffset] = useState(0);
  const [estimativa, setEstimativa] = useState("");
  const [responsavel, setResponsavel] = useState<string | null>(null);
  const [pai, setPai] = useState<string | null>(null);

  const adicionar = () => {
    const t = titulo.trim();
    if (!t) return;
    salvar.mutate(
      {
        id: null,
        valores: {
          parent_item_id: pai,
          secao_nome: secao.trim() || null,
          titulo: t,
          descricao: null,
          prioridade,
          responsavel_id: responsavel,
          dias_offset: offset,
          estimativa_horas: estimativa === "" ? null : Number(estimativa),
          ordem: (itens ?? []).length,
        },
      },
      {
        onSuccess: () => {
          setTitulo("");
          setEstimativa("");
        },
      }
    );
  };

  const nomeItem = (id: string | null) =>
    id ? (itens ?? []).find((i) => i.id === id)?.titulo ?? "—" : null;

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-destructive">
          Não foi possível carregar os itens: {(error as Error).message}
        </p>
      )}

      <div className="space-y-1 rounded-lg border border-border p-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando itens…</p>
        ) : (itens ?? []).length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">Nenhum item ainda.</p>
        ) : (
          (itens ?? []).map((i: TemplateItem) => (
            <div key={i.id} className="flex items-center gap-2 py-1 text-sm">
              <Badge variant="outline" className="shrink-0 text-[10px]">D+{i.dias_offset}</Badge>
              <span className="min-w-0 flex-1 truncate">
                {i.parent_item_id ? <span className="text-muted-foreground">↳ </span> : null}
                {i.secao_nome ? <span className="text-muted-foreground">{i.secao_nome} · </span> : null}
                {i.titulo}
              </span>
              {i.estimativa_horas != null && (
                <span className="shrink-0 text-[11px] text-muted-foreground">{i.estimativa_horas}h</span>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => excluir.mutate(i.id)}
                aria-label="Excluir item"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Nova tarefa do template</Label>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título" />
        </div>
        <div className="space-y-1.5">
          <Label>Seção</Label>
          <Input value={secao} onChange={(e) => setSecao(e.target.value)} placeholder="opcional" />
        </div>
        <div className="space-y-1.5">
          <Label>Dias após o início</Label>
          <Input
            type="number"
            min={0}
            value={offset}
            onChange={(e) => setOffset(Math.max(0, Number(e.target.value) || 0))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Prioridade</Label>
          <Select value={prioridade} onValueChange={setPrioridade}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="baixa">Baixa</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="urgente">Urgente</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Estimativa (h)</Label>
          <Input
            type="number"
            min={0}
            step="0.5"
            value={estimativa}
            onChange={(e) => setEstimativa(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Responsável</Label>
          <Select
            value={responsavel ?? SEM_VALOR}
            onValueChange={(v) => setResponsavel(v === SEM_VALOR ? null : v)}
          >
            <SelectTrigger><SelectValue placeholder="Sem responsável" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_VALOR}>Sem responsável</SelectItem>
              {(pessoas ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Item pai</Label>
          <Select value={pai ?? SEM_VALOR} onValueChange={(v) => setPai(v === SEM_VALOR ? null : v)}>
            <SelectTrigger><SelectValue placeholder="Sem pai" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_VALOR}>Sem pai</SelectItem>
              {(itens ?? []).map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.titulo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {pai && <p className="text-[11px] text-muted-foreground">Subitem de {nomeItem(pai)}</p>}
        </div>
      </div>

      <Button onClick={adicionar} disabled={!titulo.trim() || salvar.isPending}>
        <Plus className="mr-1 h-4 w-4" /> Adicionar item
      </Button>
    </div>
  );
}
