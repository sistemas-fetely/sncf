import { useState } from "react";
import { CheckCheck, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AplicarTemplateDialog } from "@/components/tarefas/templates/AplicarTemplateDialog";
import { TemplateItensEditor } from "@/components/tarefas/templates/TemplateItensEditor";
import { PageShell } from "@/components/layout/PageShell";
import {
import { PageTitle } from "@/components/layout/PageTitle";
  useExcluirTemplate, useSalvarTemplate, useTemplates, type Template,
} from "@/hooks/tarefas/useTemplates";

export default function Templates() {
  const { data: templates, isLoading, error } = useTemplates();
  const salvar = useSalvarTemplate();
  const excluir = useExcluirTemplate();

  const [form, setForm] = useState<{ id: string | null; nome: string; descricao: string; tipo: string } | null>(null);
  const [aplicando, setAplicando] = useState<Template | null>(null);
  const [itensDe, setItensDe] = useState<Template | null>(null);

  return (
    <PageShell>
      <PageTitle
        titulo="Templates"
        estado="Roteiros de projeto e checklists prontos para aplicar com datas calculadas."
        acoes={
          <Button onClick={() => setForm({ id: null, nome: "", descricao: "", tipo: "projeto" })}>
            <Plus className="mr-1 h-4 w-4" /> Novo template
          </Button>
        }
      />

      {error ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar os templates: {(error as Error).message}
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando templates…</p>
      ) : (templates ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <CheckCheck className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhum template ainda. Crie um aqui ou salve um projeto existente como template.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(templates ?? []).map((t) => (
            <Card key={t.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{t.nome}</p>
                    <Badge variant="outline" className="text-[10px] capitalize">{t.tipo}</Badge>
                    {!t.ativo && <Badge variant="outline" className="text-[10px]">Inativo</Badge>}
                  </div>
                  {t.descricao && (
                    <p className="truncate text-xs text-muted-foreground">{t.descricao}</p>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => setItensDe(t)}>Itens</Button>
                <Button size="sm" onClick={() => setAplicando(t)}>
                  <Play className="mr-1 h-3.5 w-3.5" /> Aplicar
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setForm({ id: t.id, nome: t.nome, descricao: t.descricao ?? "", tipo: t.tipo })
                  }
                  aria-label="Editar"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => excluir.mutate(t.id)} aria-label="Excluir">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!form} onOpenChange={(v) => !v && setForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar template" : "Novo template"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <Textarea
                  rows={2}
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="projeto">Projeto</SelectItem>
                    <SelectItem value="checklist">Checklist</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Projeto cria um novo projeto com as tarefas. Checklist adiciona as tarefas a um projeto já existente.
                </p>
              </div>

            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button
              disabled={!form?.nome.trim() || salvar.isPending}
              onClick={() =>
                form &&
                salvar.mutate(
                  {
                    id: form.id,
                    valores: {
                      nome: form.nome.trim(),
                      descricao: form.descricao.trim() || null,
                      tipo: form.tipo,
                      ativo: true,
                    },
                  },
                  { onSuccess: () => setForm(null) }
                )
              }
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!itensDe} onOpenChange={(v) => !v && setItensDe(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader className="text-left">
            <SheetTitle>Itens de {itensDe?.nome}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {itensDe && <TemplateItensEditor templateId={itensDe.id} />}
          </div>
        </SheetContent>
      </Sheet>

      <AplicarTemplateDialog
        template={aplicando}
        aberto={!!aplicando}
        onOpenChange={(v) => !v && setAplicando(null)}
      />
    </PageShell>
  );
}
