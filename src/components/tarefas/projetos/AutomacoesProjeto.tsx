import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SeletorPessoa, PRIORIDADE_ROTULO } from "@/components/tarefas/detalhe/comuns";
import { useStatusTarefaDim } from "@/hooks/tarefas/useStatusTarefaDim";
import { useSecoesProjeto, usePodeGerenciarProjeto } from "@/hooks/tarefas/useProjetosTarefas";
import { useEtiquetas } from "@/hooks/tarefas/useTarefasCatalogos";
import {
  ACAO_ROTULO, GATILHO_ROTULO, useAlternarRegra, useExcluirRegra, useRegrasProjeto,
  useSalvarRegra, type AcaoRegra, type AcaoTipo, type GatilhoTipo, type RegraForm,
} from "@/hooks/tarefas/useProjetoAutomacoes";

const GATILHOS = Object.keys(GATILHO_ROTULO) as GatilhoTipo[];
const ACOES = Object.keys(ACAO_ROTULO) as AcaoTipo[];
const PRIORIDADES = Object.keys(PRIORIDADE_ROTULO);

interface Props {
  projetoId: string;
}

export function AutomacoesProjeto({ projetoId }: Props) {
  const { data: regras } = useRegrasProjeto(projetoId);
  const { data: podeGerenciar } = usePodeGerenciarProjeto(projetoId);
  const salvar = useSalvarRegra(projetoId);
  const alternar = useAlternarRegra(projetoId);
  const excluir = useExcluirRegra(projetoId);
  const { data: secoes } = useSecoesProjeto(projetoId);
  const { data: etiquetas } = useEtiquetas();
  const { data: statusDim } = useStatusTarefaDim();

  const [editando, setEditando] = useState<{ id?: string; form: RegraForm } | null>(null);

  function novoForm(): RegraForm {
    return { nome: "", ativo: true, gatilho: { tipo: "tarefa_criada", valor: null }, acoes: [] };
  }

  function ValorDoContexto({
    tipo, valor, onChange,
  }: { tipo: GatilhoTipo | AcaoTipo; valor: string | null; onChange: (v: string | null) => void }) {
    if (tipo === "secao_alterada" || tipo === "mover_secao") {
      return (
        <Select value={valor ?? ""} onValueChange={onChange}>
          <SelectTrigger className="h-8 w-48"><SelectValue placeholder="Seção" /></SelectTrigger>
          <SelectContent>
            {(secoes ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    }
    if (tipo === "status_alterado" || tipo === "definir_status") {
      return (
        <Select value={valor ?? ""} onValueChange={onChange}>
          <SelectTrigger className="h-8 w-48"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            {(statusDim ?? []).map((s) => <SelectItem key={s.codigo} value={s.codigo}>{s.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    }
    if (tipo === "definir_prioridade") {
      return (
        <Select value={valor ?? ""} onValueChange={onChange}>
          <SelectTrigger className="h-8 w-48"><SelectValue placeholder="Prioridade" /></SelectTrigger>
          <SelectContent>
            {PRIORIDADES.map((p) => <SelectItem key={p} value={p}>{PRIORIDADE_ROTULO[p]}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    }
    if (tipo === "etiqueta_adicionada" || tipo === "adicionar_etiqueta") {
      return (
        <Select value={valor ?? ""} onValueChange={onChange}>
          <SelectTrigger className="h-8 w-48"><SelectValue placeholder="Etiqueta" /></SelectTrigger>
          <SelectContent>
            {(etiquetas ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    }
    if (tipo === "definir_responsavel" || tipo === "responsavel_alterado") {
      return (
        <div className="w-48">
          <SeletorPessoa valor={valor} onChange={onChange} />
        </div>
      );
    }
    if (tipo === "definir_data_limite") {
      return (
        <Input
          type="number"
          className="h-8 w-28"
          value={valor ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="dias"
        />
      );
    }
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Regras que o banco executa quando algo acontece na tarefa.
        </p>
        <Button
          size="sm"
          disabled={!podeGerenciar}
          onClick={() => setEditando({ form: novoForm() })}
        >
          <Plus className="mr-1 h-4 w-4" /> Nova automação
        </Button>
      </div>

      {editando && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input
                value={editando.form.nome}
                onChange={(e) => setEditando({ ...editando, form: { ...editando.form, nome: e.target.value } })}
                placeholder="Ex.: entrou em Revisão → avisa o responsável"
              />
            </div>

            <div className="space-y-1">
              <Label>Quando</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={editando.form.gatilho.tipo}
                  onValueChange={(v) =>
                    setEditando({
                      ...editando,
                      form: { ...editando.form, gatilho: { tipo: v as GatilhoTipo, valor: null } },
                    })
                  }
                >
                  <SelectTrigger className="h-8 w-64"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GATILHOS.map((g) => <SelectItem key={g} value={g}>{GATILHO_ROTULO[g]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <ValorDoContexto
                  tipo={editando.form.gatilho.tipo}
                  valor={editando.form.gatilho.valor ?? null}
                  onChange={(v) =>
                    setEditando({
                      ...editando,
                      form: { ...editando.form, gatilho: { ...editando.form.gatilho, valor: v } },
                    })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Então</Label>
              {editando.form.acoes.map((a, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Select
                    value={a.tipo}
                    onValueChange={(v) => {
                      const acoes = editando.form.acoes.slice();
                      acoes[i] = { tipo: v as AcaoTipo, valor: null };
                      setEditando({ ...editando, form: { ...editando.form, acoes } });
                    }}
                  >
                    <SelectTrigger className="h-8 w-64"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACOES.map((x) => <SelectItem key={x} value={x}>{ACAO_ROTULO[x]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <ValorDoContexto
                    tipo={a.tipo}
                    valor={a.valor}
                    onChange={(v) => {
                      const acoes = editando.form.acoes.slice();
                      acoes[i] = { ...acoes[i], valor: v };
                      setEditando({ ...editando, form: { ...editando.form, acoes } });
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() =>
                      setEditando({
                        ...editando,
                        form: { ...editando.form, acoes: editando.form.acoes.filter((_, j) => j !== i) },
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const nova: AcaoRegra = { tipo: "definir_status", valor: null };
                  setEditando({ ...editando, form: { ...editando.form, acoes: [...editando.form.acoes, nova] } });
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar ação
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={editando.form.ativo}
                onCheckedChange={(v) => setEditando({ ...editando, form: { ...editando.form, ativo: v } })}
              />
              <span className="text-sm">Ativa</span>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditando(null)}>Cancelar</Button>
              <Button
                size="sm"
                disabled={!editando.form.nome.trim() || editando.form.acoes.length === 0 || salvar.isPending}
                onClick={async () => {
                  await salvar.mutateAsync({ id: editando.id, form: editando.form });
                  setEditando(null);
                }}
              >
                Salvar automação
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {(regras ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma automação neste projeto.</p>
        )}
        {(regras ?? []).map((r) => (
          <Card key={r.id}>
            <CardContent className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.nome}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {GATILHO_ROTULO[r.gatilho.tipo]} → {r.acoes.map((a) => ACAO_ROTULO[a.tipo]).join(", ") || "—"}
                </p>
              </div>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {r.execucoes} execuções
                {r.ultima_execucao_em
                  ? ` · ${format(parseISO(r.ultima_execucao_em), "dd/MM/yy HH:mm", { locale: ptBR })}`
                  : ""}
              </Badge>
              <Switch
                checked={r.ativo}
                disabled={!podeGerenciar}
                onCheckedChange={(v) => alternar.mutate({ id: r.id, ativo: v })}
              />
              <Button
                variant="ghost"
                size="sm"
                disabled={!podeGerenciar}
                onClick={() => setEditando({ id: r.id, form: { nome: r.nome, ativo: r.ativo, gatilho: r.gatilho, acoes: r.acoes } })}
              >
                Editar
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={!podeGerenciar}
                onClick={() => excluir.mutate(r.id)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
