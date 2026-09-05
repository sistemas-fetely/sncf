import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProjetos, useSecoes, useEtiquetas } from "@/hooks/tarefas/useTarefasCatalogos";
import {
  useCamposPersonalizados, useCriarSubtarefa, useEtiquetasDaTarefa, useMutarEtiquetasTarefa,
  useMutarPapel, usePapeisTarefa, useSalvarCampoTarefa, useSalvarValorCampo, useSubtarefas,
  useValoresCampos, type CampoPersonalizado, type TarefaDetalhe,
} from "@/hooks/tarefas/useTarefaDetalhe";
import { Campo, PRIORIDADE_ROTULO, Secao, SEM_VALOR, SeletorPessoa, useNomePessoa, useStatusRotulo } from "./comuns";
import { useStatusTarefaDim } from "@/hooks/tarefas/useStatusTarefaDim";
import type { TarefaPrioridade, TarefaStatus } from "@/hooks/tarefas/useTarefas";

/* ------------------------------------------------------------- campos ----- */

export function BlocoCampos({ tarefa }: { tarefa: TarefaDetalhe }) {
  const salvar = useSalvarCampoTarefa(tarefa.id);
  const { data: projetos } = useProjetos();
  const { data: secoes } = useSecoes(tarefa.projeto_id);
  const [estimativa, setEstimativa] = useState(tarefa.estimativa_horas?.toString() ?? "");
  const { data: statusDim } = useStatusTarefaDim();

  useEffect(() => setEstimativa(tarefa.estimativa_horas?.toString() ?? ""), [tarefa.estimativa_horas]);

  return (
    <div className="grid grid-cols-2 gap-3">
      <Campo rotulo="Status">
        <Select value={tarefa.status} onValueChange={(v) => salvar.mutate({ status: v as TarefaStatus })}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(statusDim ?? []).map((s) => (
              <SelectItem key={s.codigo} value={s.codigo}>{s.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Campo>

      <Campo rotulo="Prioridade">
        <Select value={tarefa.prioridade} onValueChange={(v) => salvar.mutate({ prioridade: v as TarefaPrioridade })}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(PRIORIDADE_ROTULO).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Campo>

      <Campo rotulo="Responsável (R)">
        <SeletorPessoa valor={tarefa.responsavel_id} onChange={(id) => salvar.mutate({ responsavel_id: id })} />
      </Campo>

      {/* Subtarefa não tem endereço próprio: projeto e seção são sempre os da mãe
          (o banco sobrescreve), então nem aparecem como campo editável. */}
      {tarefa.parent_id ? (
        <div className="col-span-2 rounded border border-border/60 bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          Esta é uma subtarefa: projeto e seção acompanham a tarefa-mãe e não são
          editáveis aqui.
        </div>
      ) : (
        <>
          <Campo rotulo="Projeto">
            <Select
              value={tarefa.projeto_id ?? SEM_VALOR}
              onValueChange={(v) =>
                // trocar de projeto invalida a seção antiga — ela pertence a outro projeto
                salvar.mutate({ projeto_id: v === SEM_VALOR ? null : v, secao_id: null })
              }
            >
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Sem projeto" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>— sem projeto —</SelectItem>
                {(projetos ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>

          <Campo rotulo="Seção">
            <Select
              value={tarefa.secao_id ?? SEM_VALOR}
              disabled={!tarefa.projeto_id}
              onValueChange={(v) => salvar.mutate({ secao_id: v === SEM_VALOR ? null : v })}
            >
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Sem seção" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>— sem seção —</SelectItem>
                {(secoes ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
        </>
      )}

      <Campo rotulo="Data de início">
        <Input
          type="date" className="h-8 text-sm" value={tarefa.data_inicio ?? ""}
          onChange={(e) => salvar.mutate({ data_inicio: e.target.value || null })}
        />
      </Campo>

      <Campo rotulo="Data limite">
        <Input
          type="date" className="h-8 text-sm" value={tarefa.data_limite ?? ""}
          onChange={(e) => salvar.mutate({ data_limite: e.target.value || null })}
        />
      </Campo>

      <Campo rotulo="Hora limite">
        <Input
          type="time" className="h-8 text-sm" value={tarefa.hora_limite?.slice(0, 5) ?? ""}
          onChange={(e) => salvar.mutate({ hora_limite: e.target.value || null })}
        />
      </Campo>

      <Campo rotulo="Estimativa (horas)">
        <Input
          type="number" step="0.25" min="0" className="h-8 text-sm" value={estimativa}
          onChange={(e) => setEstimativa(e.target.value)}
          onBlur={() =>
            salvar.mutate({ estimativa_horas: estimativa === "" ? null : Number(estimativa) })
          }
        />
      </Campo>
    </div>
  );
}

/* ---------------------------------------------------------- descrição ----- */

export function BlocoDescricao({ tarefa }: { tarefa: TarefaDetalhe }) {
  const salvar = useSalvarCampoTarefa(tarefa.id);
  const [texto, setTexto] = useState(tarefa.descricao ?? "");
  useEffect(() => setTexto(tarefa.descricao ?? ""), [tarefa.descricao]);

  return (
    <Secao titulo="Descrição">
      <Textarea
        rows={4} value={texto} placeholder="O que precisa ser feito?"
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          if ((tarefa.descricao ?? "") !== texto) salvar.mutate({ descricao: texto || null });
        }}
      />
    </Secao>
  );
}

/* --------------------------------------------------------- subtarefas ----- */

export function BlocoSubtarefas({ tarefa }: { tarefa: TarefaDetalhe }) {
  const rotuloStatus = useStatusRotulo();
  const { data: filhas } = useSubtarefas(tarefa.id);
  const criar = useCriarSubtarefa(tarefa);
  const [titulo, setTitulo] = useState("");
  const lista = filhas ?? [];
  const feitas = lista.filter((t) => t.status === "concluida").length;

  return (
    <Secao
      titulo="Subtarefas"
      acao={<span className="text-xs text-muted-foreground">{feitas}/{lista.length}</span>}
    >
      <div className="space-y-1">
        {lista.map((t) => (
          <div key={t.id} className="flex items-center gap-2 rounded border border-border/60 px-2 py-1.5 text-sm">
            <Badge variant="outline" className="text-[10px]">{rotuloStatus(t.status)}</Badge>
            <span className={t.status === "concluida" ? "line-through text-muted-foreground" : ""}>
              {t.titulo}
            </span>
          </div>
        ))}
        {lista.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma subtarefa.</p>}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Subtarefa é passo desta tarefa. Se você atribuir uma delas a outra pessoa,
        ela passa a valer como tarefa independente na lista dessa pessoa.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          criar.mutate(titulo, { onSuccess: () => setTitulo("") });
        }}
      >
        <Input
          className="h-8 text-sm" placeholder="Nova subtarefa" value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
        />
        <Button type="submit" size="sm" variant="outline" disabled={criar.isPending || !titulo.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </form>
    </Secao>
  );
}

/* --------------------------------------------------------------- RACI ----- */

const RACI: { papel: "a" | "c" | "i"; rotulo: string; unico: boolean }[] = [
  { papel: "a", rotulo: "A — Responde", unico: true },
  { papel: "c", rotulo: "C — Consultado", unico: false },
  { papel: "i", rotulo: "I — Informado", unico: false },
];

export function BlocoRaci({ tarefa }: { tarefa: TarefaDetalhe }) {
  const { data: papeis } = usePapeisTarefa(tarefa.id);
  const { adicionar, remover } = useMutarPapel(tarefa.id);
  const salvar = useSalvarCampoTarefa(tarefa.id);
  const nome = useNomePessoa();

  const doPapel = (p: string) => (papeis ?? []).filter((l) => l.papel === p);

  return (
    <Secao titulo="Responsabilidades (RACI)">
      <div className="space-y-3">
        <div className="space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            R — Executa
          </span>
          {/* R é o campo responsavel_id; o banco espelha em tarefas_papeis */}
          <SeletorPessoa valor={tarefa.responsavel_id} onChange={(id) => salvar.mutate({ responsavel_id: id })} />
        </div>

        {RACI.map(({ papel, rotulo, unico }) => {
          const linhas = doPapel(papel);
          return (
            <div key={papel} className="space-y-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {rotulo}
              </span>
              <div className="flex flex-wrap gap-1">
                {linhas.map((l) => (
                  <Badge key={l.user_id} variant="secondary" className="gap-1">
                    {nome(l.user_id)}
                    <button
                      type="button" aria-label="Remover"
                      onClick={() => remover.mutate({ userId: l.user_id, papel })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {linhas.length === 0 && <span className="text-xs text-muted-foreground">ninguém</span>}
              </div>
              {(!unico || linhas.length === 0 || true) && (
                <SeletorPessoa
                  valor={unico ? (linhas[0]?.user_id ?? null) : null}
                  permiteVazio={false}
                  placeholder={unico ? "Escolher pessoa" : "Adicionar pessoa"}
                  onChange={(id) => id && adicionar.mutate({ userId: id, papel })}
                />
              )}
            </div>
          );
        })}
      </div>
    </Secao>
  );
}

/* ---------------------------------------------------------- etiquetas ----- */

export function BlocoEtiquetas({ tarefa }: { tarefa: TarefaDetalhe }) {
  const { data: aplicadas } = useEtiquetasDaTarefa(tarefa.id);
  const { data: catalogo } = useEtiquetas();
  const { vincular, desvincular } = useMutarEtiquetasTarefa(tarefa.id);
  const [nova, setNova] = useState("");

  const disponiveis = (catalogo ?? []).filter(
    (e) => !(aplicadas ?? []).some((a) => a.id === e.id),
  );

  return (
    <Secao titulo="Etiquetas">
      <div className="flex flex-wrap gap-1">
        {(aplicadas ?? []).map((e) => (
          <Badge
            key={e.id} variant="outline" className="gap-1"
            style={{ borderColor: e.cor || undefined, color: e.cor || undefined }}
          >
            {e.nome}
            <button type="button" aria-label="Remover etiqueta" onClick={() => desvincular.mutate(e.id)}>
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {(aplicadas ?? []).length === 0 && <span className="text-xs text-muted-foreground">Sem etiquetas.</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {disponiveis.length > 0 && (
          <Select value="" onValueChange={(v) => vincular.mutate(v)}>
            <SelectTrigger className="h-8 w-44 text-sm"><SelectValue placeholder="Aplicar existente" /></SelectTrigger>
            <SelectContent>
              {disponiveis.map((e) => (
                <SelectItem key={e.id} value={e.nome}>{e.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            vincular.mutate(nova, { onSuccess: () => setNova("") });
          }}
        >
          <Input
            className="h-8 w-40 text-sm" placeholder="Criar etiqueta" value={nova}
            onChange={(e) => setNova(e.target.value)}
          />
          <Button type="submit" size="sm" variant="outline" disabled={!nova.trim() || vincular.isPending}>
            <Plus className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </Secao>
  );
}

/* --------------------------------------------- campos personalizados ------ */

function opcoesDoCampo(campo: CampoPersonalizado): string[] {
  const o = campo.opcoes;
  if (Array.isArray(o)) return o.map(String);
  if (o && typeof o === "object" && Array.isArray((o as { valores?: unknown }).valores)) {
    return ((o as { valores: unknown[] }).valores).map(String);
  }
  return [];
}

function ValorCampo({
  campo, valor, salvar,
}: { campo: CampoPersonalizado; valor: unknown; salvar: (v: unknown) => void }) {
  const [texto, setTexto] = useState(valor == null ? "" : String(valor));
  useEffect(() => setTexto(valor == null ? "" : String(valor)), [valor]);
  const opcoes = opcoesDoCampo(campo);

  if (campo.tipo === "checkbox") {
    return (
      <Checkbox checked={valor === true} onCheckedChange={(v) => salvar(v === true)} />
    );
  }
  if (campo.tipo === "pessoa") {
    return (
      <SeletorPessoa
        valor={typeof valor === "string" ? valor : null}
        onChange={(id) => salvar(id)}
      />
    );
  }
  if (campo.tipo === "selecao") {
    return (
      <Select value={typeof valor === "string" ? valor : SEM_VALOR} onValueChange={(v) => salvar(v === SEM_VALOR ? null : v)}>
        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Escolher" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={SEM_VALOR}>— vazio —</SelectItem>
          {opcoes.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  if (campo.tipo === "multi_selecao") {
    const atuais = Array.isArray(valor) ? (valor as unknown[]).map(String) : [];
    return (
      <div className="flex flex-wrap gap-2">
        {opcoes.map((o) => (
          <label key={o} className="flex items-center gap-1 text-sm">
            <Checkbox
              checked={atuais.includes(o)}
              onCheckedChange={(v) =>
                salvar(v === true ? [...atuais, o] : atuais.filter((a) => a !== o))
              }
            />
            {o}
          </label>
        ))}
        {opcoes.length === 0 && <span className="text-xs text-muted-foreground">Sem opções configuradas.</span>}
      </div>
    );
  }

  const tipoInput = campo.tipo === "data" ? "date" : campo.tipo === "numero" || campo.tipo === "moeda" ? "number" : "text";
  return (
    <Input
      type={tipoInput} className="h-8 text-sm" value={texto}
      step={campo.tipo === "moeda" ? "0.01" : undefined}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        if (texto === "") return salvar(null);
        salvar(tipoInput === "number" ? Number(texto) : texto);
      }}
    />
  );
}

export function BlocoCamposPersonalizados({ tarefa }: { tarefa: TarefaDetalhe }) {
  const { data: campos } = useCamposPersonalizados(tarefa.projeto_id);
  const { data: valores } = useValoresCampos(tarefa.id);
  const salvar = useSalvarValorCampo(tarefa.id);

  if (!tarefa.projeto_id || !campos?.length) return null;

  return (
    <Secao titulo="Campos personalizados">
      <div className="grid grid-cols-2 gap-3">
        {campos.map((c) => (
          <Campo key={c.campo_id} rotulo={c.nome + (c.obrigatorio ? " *" : "")}>
            <ValorCampo
              campo={c}
              valor={valores?.[c.campo_id] ?? null}
              salvar={(v) => salvar.mutate({ campoId: c.campo_id, valor: v })}
            />
          </Campo>
        ))}
      </div>
    </Secao>
  );
}
