import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { usePodeGerenciarProjeto } from "@/hooks/tarefas/useProjetosTarefas";
import {
  CAMPO_TIPO_ROTULO, useAtualizarCampoProjeto, useCamposCatalogo, useCamposDoProjeto,
  useDesvincularCampo, useVincularCampo,
} from "@/hooks/tarefas/useProjetoCampos";

interface Props {
  projetoId: string;
}

export function CamposProjeto({ projetoId }: Props) {
  const { data: catalogo } = useCamposCatalogo();
  const { data: vinculos } = useCamposDoProjeto(projetoId);
  const { data: podeGerenciar } = usePodeGerenciarProjeto(projetoId);
  const vincular = useVincularCampo(projetoId);
  const atualizar = useAtualizarCampoProjeto(projetoId);
  const desvincular = useDesvincularCampo(projetoId);
  const criarCampo = useCriarCampo();

  const [aVincular, setAVincular] = useState<string>("");
  const [novoNome, setNovoNome] = useState("");
  const [novoTipo, setNovoTipo] = useState<CampoTipo>("texto");
  const [novasOpcoes, setNovasOpcoes] = useState("");

  const disponiveis = (catalogo ?? []).filter(
    (c) => !(vinculos ?? []).some((v) => v.campo_id === c.id)
  );

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-medium">Campos do projeto</h3>
        {(vinculos ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum campo ligado a este projeto.</p>
        )}
        {(vinculos ?? []).map((v) => {
          const meta = catalogo?.find((c) => c.id === v.campo_id);
          return (
            <Card key={v.campo_id}>
              <CardContent className="flex flex-wrap items-center gap-4 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{meta?.nome ?? "Campo"}</p>
                  <p className="text-xs text-muted-foreground">
                    {meta ? CAMPO_TIPO_ROTULO[meta.tipo] : "—"}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={v.obrigatorio}
                    disabled={!podeGerenciar}
                    onCheckedChange={(x) => atualizar.mutate({ campoId: v.campo_id, patch: { obrigatorio: x } })}
                  />
                  Obrigatório
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={v.mostrar_no_card}
                    disabled={!podeGerenciar}
                    onCheckedChange={(x) => atualizar.mutate({ campoId: v.campo_id, patch: { mostrar_no_card: x } })}
                  />
                  Mostrar no card
                </label>
                <div className="flex items-center gap-1 text-xs">
                  Ordem
                  <Input
                    type="number"
                    className="h-8 w-16"
                    defaultValue={v.ordem}
                    disabled={!podeGerenciar}
                    onBlur={(e) => {
                      const ordem = Number(e.target.value);
                      if (Number.isFinite(ordem) && ordem !== v.ordem) {
                        atualizar.mutate({ campoId: v.campo_id, patch: { ordem } });
                      }
                    }}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={!podeGerenciar}
                  onClick={() => desvincular.mutate(v.campo_id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="space-y-2 border-t pt-4">
        <h3 className="text-sm font-medium">Ligar campo existente</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={aVincular} onValueChange={setAVincular}>
            <SelectTrigger className="h-9 w-64">
              <SelectValue placeholder="Escolher campo do catálogo" />
            </SelectTrigger>
            <SelectContent>
              {disponiveis.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome} · {CAMPO_TIPO_ROTULO[c.tipo]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!podeGerenciar || !aVincular || vincular.isPending}
            onClick={async () => {
              await vincular.mutateAsync({ campoId: aVincular, ordem: vinculos?.length ?? 0 });
              setAVincular("");
            }}
          >
            Ligar ao projeto
          </Button>
        </div>
      </section>

      <section className="space-y-2 border-t pt-4">
        <h3 className="text-sm font-medium">Criar campo novo</h3>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="campo-nome">Nome</Label>
            <Input
              id="campo-nome"
              className="h-9 w-56"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={novoTipo} onValueChange={(v) => setNovoTipo(v as CampoTipo)}>
              <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => <SelectItem key={t} value={t}>{CAMPO_TIPO_ROTULO[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {(novoTipo === "selecao" || novoTipo === "multi_selecao") && (
            <div className="space-y-1">
              <Label htmlFor="campo-opcoes">Opções (separadas por vírgula)</Label>
              <Input
                id="campo-opcoes"
                className="h-9 w-72"
                value={novasOpcoes}
                onChange={(e) => setNovasOpcoes(e.target.value)}
              />
            </div>
          )}
          <Button
            size="sm"
            disabled={!podeGerenciar || !novoNome.trim() || criarCampo.isPending}
            onClick={async () => {
              const opcoes = novasOpcoes.split(",").map((o) => o.trim()).filter(Boolean);
              const id = await criarCampo.mutateAsync({ nome: novoNome.trim(), tipo: novoTipo, opcoes });
              await vincular.mutateAsync({ campoId: id, ordem: vinculos?.length ?? 0 });
              setNovoNome(""); setNovasOpcoes("");
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Criar e ligar
          </Button>
        </div>
      </section>
    </div>
  );
}
