// Campos de Tarefa — CATALOGO-DA-EMPRESA
// O catálogo de campos personalizados de tarefa é da empresa inteira: nasce aqui,
// uma vez, e é reaproveitado. Ligar a um projeto é decisão de cada projeto.
import { useMemo, useState } from "react";
import { Loader2, Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { CAMPO_TIPO_ROTULO, type CampoTipo } from "@/hooks/tarefas/useProjetoCampos";
import {
  motivoNaoPodeApagar, opcoesParaTexto, useAlternarAtivoCampo, useApagarCampoCatalogo,
  useCatalogoCamposTarefa, useCriarCampoCatalogo, useDepartamentosAtivos,
  useEditarCampoCatalogo, type CampoCatalogoUso,
} from "@/hooks/tarefas/useCatalogoCamposTarefa";

const TIPOS = Object.keys(CAMPO_TIPO_ROTULO) as CampoTipo[];
const SEM_DEPTO = "__sem__";

function precisaOpcoes(tipo: CampoTipo) {
  return tipo === "selecao" || tipo === "multi_selecao";
}

interface FormEstado {
  nome: string;
  descricao: string;
  tipo: CampoTipo;
  departamentoId: string;
  opcoes: string;
}

const FORM_VAZIO: FormEstado = {
  nome: "", descricao: "", tipo: "texto", departamentoId: SEM_DEPTO, opcoes: "",
};

export default function CamposTarefa() {
  const { data: campos, isLoading } = useCatalogoCamposTarefa();
  const { data: departamentos } = useDepartamentosAtivos();
  const criar = useCriarCampoCatalogo();
  const editar = useEditarCampoCatalogo();
  const alternar = useAlternarAtivoCampo();
  const apagar = useApagarCampoCatalogo();

  const [busca, setBusca] = useState("");
  const [dialogAberto, setDialogAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<CampoCatalogoUso | null>(null);
  const [form, setForm] = useState<FormEstado>(FORM_VAZIO);
  const [aApagar, setAApagar] = useState<CampoCatalogoUso | null>(null);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return campos ?? [];
    return (campos ?? []).filter((c) =>
      [c.nome, c.descricao ?? "", c.departamento ?? "", CAMPO_TIPO_ROTULO[c.tipo] ?? c.tipo]
        .join(" ").toLowerCase().includes(t),
    );
  }, [campos, busca]);

  const travaTipo = !!emEdicao && emEdicao.valores_preenchidos > 0;

  function abrirNovo() {
    setEmEdicao(null);
    setForm(FORM_VAZIO);
    setDialogAberto(true);
  }

  function abrirEdicao(c: CampoCatalogoUso) {
    setEmEdicao(c);
    setForm({
      nome: c.nome,
      descricao: c.descricao ?? "",
      tipo: c.tipo,
      departamentoId: c.departamento_id ?? SEM_DEPTO,
      opcoes: opcoesParaTexto(c.opcoes),
    });
    setDialogAberto(true);
  }

  const opcoesArray = form.opcoes.split(",").map((o) => o.trim()).filter(Boolean);
  const formInvalido =
    !form.nome.trim() || (precisaOpcoes(form.tipo) && opcoesArray.length === 0);

  async function salvar() {
    const departamento_id = form.departamentoId === SEM_DEPTO ? null : form.departamentoId;
    const descricao = form.descricao.trim() || null;
    if (emEdicao) {
      await editar.mutateAsync({
        id: emEdicao.id,
        nome: form.nome.trim(),
        descricao,
        departamento_id,
        opcoes: opcoesArray,
        tipo: travaTipo ? undefined : form.tipo,
      });
    } else {
      await criar.mutateAsync({
        nome: form.nome.trim(), descricao, tipo: form.tipo, departamento_id, opcoes: opcoesArray,
      });
    }
    setDialogAberto(false);
    setEmEdicao(null);
    setForm(FORM_VAZIO);
  }

  const salvando = criar.isPending || editar.isPending;

  return (
    <PageShell>
      <PageHeader
        titulo="Campos de Tarefa"
        icone={SlidersHorizontal}
        estado={
          isLoading
            ? "Carregando catálogo…"
            : `${(campos ?? []).length} campos · ${(campos ?? []).filter((c) => c.ativo).length} ativos`
        }
        acoes={
          <Button onClick={abrirNovo}>
            <Plus className="mr-1 h-4 w-4" /> Novo campo
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-1 p-4 text-sm text-muted-foreground">
          <p>
            O campo é criado <strong className="text-foreground">uma vez</strong> aqui e
            reaproveitado em vários projetos — este catálogo é da empresa inteira.
          </p>
          <p>
            Ligar um campo a um projeto é decisão de cada projeto, na aba{" "}
            <strong className="text-foreground">Campos</strong> dele. Desativar aqui tira o campo
            das listas de escolha, mas mantém tudo que já foi preenchido.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3 [grid-template-columns:minmax(0,1fr)_240px]">
        <Input
          placeholder="Buscar por nome, tipo ou departamento"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {busca ? "Nenhum campo encontrado." : "O catálogo ainda está vazio."}
        </p>
      ) : (
        <TooltipProvider>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
            {lista.map((c) => {
              const motivo = motivoNaoPodeApagar(c);
              const opcoes = opcoesParaTexto(c.opcoes);
              return (
                <Card key={c.id} className={c.ativo ? undefined : "opacity-70"}>
                  <CardContent className="flex h-full flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{c.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {CAMPO_TIPO_ROTULO[c.tipo] ?? c.tipo}
                          {c.departamento ? ` · ${c.departamento}` : " · sem departamento"}
                        </p>
                      </div>
                      <Badge variant={c.ativo ? "default" : "secondary"}>
                        {c.ativo ? "Ativo" : "Desativado"}
                      </Badge>
                    </div>

                    {c.descricao && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{c.descricao}</p>
                    )}
                    {precisaOpcoes(c.tipo) && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        Opções: {opcoes || <span className="text-destructive">nenhuma</span>}
                      </p>
                    )}

                    <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(110px,1fr))] text-xs">
                      <div className="rounded-md border border-border px-2 py-1.5">
                        <p className="text-base font-semibold leading-none">{c.projetos_ligados}</p>
                        <p className="text-muted-foreground">projetos ligados</p>
                      </div>
                      <div className="rounded-md border border-border px-2 py-1.5">
                        <p className="text-base font-semibold leading-none">{c.valores_preenchidos}</p>
                        <p className="text-muted-foreground">valores preenchidos</p>
                      </div>
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
                      <label className="flex items-center gap-2 text-xs">
                        <Switch
                          checked={c.ativo}
                          disabled={alternar.isPending}
                          onCheckedChange={(v) => alternar.mutate({ id: c.id, ativo: v })}
                        />
                        {c.ativo ? "Ativo" : "Desativado"}
                      </label>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => abrirEdicao(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {motivo ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span tabIndex={0}>
                                <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Não pode apagar: {motivo}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setAApagar(c)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TooltipProvider>
      )}

      <Dialog open={dialogAberto} onOpenChange={(o) => { if (!o) { setDialogAberto(false); setEmEdicao(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{emEdicao ? "Editar campo" : "Novo campo"}</DialogTitle>
            <DialogDescription>
              O campo entra no catálogo da empresa. Cada projeto decide se liga ou não.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="campo-nome">Nome</Label>
              <Input
                id="campo-nome"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="campo-descricao">Descrição</Label>
              <Textarea
                id="campo-descricao"
                rows={2}
                value={form.descricao}
                onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
              />
            </div>

            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select
                  value={form.tipo}
                  disabled={travaTipo}
                  onValueChange={(v) => setForm((f) => ({ ...f, tipo: v as CampoTipo }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => (
                      <SelectItem key={t} value={t}>{CAMPO_TIPO_ROTULO[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {travaTipo && (
                  <p className="text-[11px] text-muted-foreground">
                    Tipo travado: este campo já tem {emEdicao?.valores_preenchidos} valores
                    gravados e mudar o tipo mudaria o significado deles.
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label>Departamento (opcional)</Label>
                <Select
                  value={form.departamentoId}
                  onValueChange={(v) => setForm((f) => ({ ...f, departamentoId: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_DEPTO}>Sem departamento</SelectItem>
                    {(departamentos ?? []).map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {precisaOpcoes(form.tipo) && (
              <div className="space-y-1">
                <Label htmlFor="campo-opcoes">Opções (separadas por vírgula)</Label>
                <Input
                  id="campo-opcoes"
                  value={form.opcoes}
                  onChange={(e) => setForm((f) => ({ ...f, opcoes: e.target.value }))}
                />
                <p className="text-[11px] text-muted-foreground">
                  Sem opções, este tipo de campo não serve para nada.
                  {opcoesArray.length > 0 && ` ${opcoesArray.length} opções.`}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogAberto(false); setEmEdicao(null); }}>
              Cancelar
            </Button>
            <Button disabled={formInvalido || salvando} onClick={salvar}>
              {salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {emEdicao ? "Salvar" : "Criar campo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!aApagar} onOpenChange={(o) => { if (!o) setAApagar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar o campo "{aApagar?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Este campo não está ligado a nenhum projeto e não tem valores preenchidos, então
              apagar não perde dado nenhum. A ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async (e) => {
                e.preventDefault();
                if (!aApagar) return;
                await apagar.mutateAsync(aApagar.id);
                setAApagar(null);
              }}
            >
              Apagar campo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
