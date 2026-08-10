/**
 * Editor de regra (só super_admin). O fluxo de segurança é o produto:
 * regra nasce inativa -> Testar (dry-run) -> só então libera "Ativa".
 * Editar o SQL de regra ativa desativa a regra e invalida o teste (o banco faz).
 * Mensagens de recusa do banco vão inteiras para o toast.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { formatError } from "@/lib/format-error";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, FlaskConical, Loader2 } from "lucide-react";
import {
  useDimsAuditoria,
  useSalvarRegra,
  useTestarRegra,
  type ResultadoTeste,
} from "@/hooks/auditoria/useAuditoria";
import { AJUDA_CONTRATO_SQL, type Regra } from "@/lib/auditoria/meta";

type Form = {
  slug: string;
  titulo: string;
  modulo_slug: string;
  entidade: string;
  severidade: string;
  o_que_significa: string;
  modo: string;
  sql_achado: string;
  rota_acao: string;
  rotulo_acao: string;
  ordem: number;
  orcamento_ms: number;
  observacao: string;
  ativo: boolean;
};

const VAZIO: Form = {
  slug: "",
  titulo: "",
  modulo_slug: "",
  entidade: "",
  severidade: "atencao",
  o_que_significa: "",
  modo: "achado",
  sql_achado: "SELECT ",
  rota_acao: "",
  rotulo_acao: "",
  ordem: 100,
  orcamento_ms: 5000,
  observacao: "",
  ativo: false,
};

export default function RegraEditorDialog({
  aberto,
  regra,
  onClose,
}: {
  aberto: boolean;
  regra: Regra | null;
  onClose: () => void;
}) {
  const dims = useDimsAuditoria();
  const salvar = useSalvarRegra();
  const testar = useTestarRegra();
  const criando = !regra;

  const [form, setForm] = useState<Form>(VAZIO);
  const [teste, setTeste] = useState<ResultadoTeste | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setTeste(null);
    setForm(
      regra
        ? {
            slug: regra.slug,
            titulo: regra.titulo,
            modulo_slug: regra.modulo_slug,
            entidade: regra.entidade,
            severidade: regra.severidade,
            o_que_significa: regra.o_que_significa ?? "",
            modo: regra.modo,
            sql_achado: regra.sql_achado,
            rota_acao: regra.rota_acao ?? "",
            rotulo_acao: regra.rotulo_acao ?? "",
            ordem: regra.ordem,
            orcamento_ms: regra.orcamento_ms,
            observacao: regra.observacao ?? "",
            ativo: regra.ativo,
          }
        : VAZIO,
    );
  }, [aberto, regra]);

  const sqlMudou = !!regra && form.sql_achado !== regra.sql_achado;
  const testeValidoNoBanco = !!regra && !!regra.testado_em && !regra.testado_erro && !sqlMudou;
  const podeAtivar = (teste?.ok === true && !sqlMudou) || testeValidoNoBanco;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => ({ ...p, [k]: v }));

  const ajuda = useMemo(
    () => AJUDA_CONTRATO_SQL[form.modo === "contagem" ? "contagem" : "achado"],
    [form.modo],
  );

  async function rodarTeste() {
    if (criando) {
      toast.error("Salve a regra primeiro — o teste roda sobre o SQL gravado.");
      return;
    }
    try {
      const r = await testar.mutateAsync(form.slug);
      setTeste(r);
      if (r.ok) toast.success(`Teste válido — ${r.linhas ?? r.contagem ?? 0} resultado(s).`);
      else toast.error(r.erro || "O teste não passou.");
    } catch (e) {
      toast.error(formatError(e));
    }
  }

  async function submeter() {
    if (!form.slug.trim() || !form.titulo.trim() || !form.modulo_slug || !form.entidade) {
      toast.error("Preencha slug, título, módulo e entidade.");
      return;
    }
    try {
      await salvar.mutateAsync({
        criando,
        valores: {
          slug: form.slug.trim(),
          titulo: form.titulo.trim(),
          modulo_slug: form.modulo_slug,
          entidade: form.entidade,
          severidade: form.severidade,
          o_que_significa: form.o_que_significa || null,
          modo: form.modo,
          sql_achado: form.sql_achado,
          rota_acao: form.rota_acao || null,
          rotulo_acao: form.rotulo_acao || null,
          ordem: Number(form.ordem) || 0,
          orcamento_ms: Number(form.orcamento_ms) || 5000,
          observacao: form.observacao || null,
          ativo: criando ? false : form.ativo && podeAtivar,
        },
      });
      toast.success(criando ? "Regra criada — nasce inativa." : "Regra salva.");
      onClose();
    } catch (e) {
      // A mensagem do banco vai inteira: ela já foi escrita para o operador ler.
      toast.error(formatError(e));
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{criando ? "Nova regra de auditoria" : `Editar ${regra?.slug}`}</DialogTitle>
          <DialogDescription>
            Regra nasce inativa. Só ativa depois de um teste válido (dry-run) que prove que o SQL
            acha a coisa certa.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Slug</Label>
                <Input
                  value={form.slug}
                  disabled={!criando}
                  onChange={(e) => set("slug", e.target.value)}
                  className="h-9 font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Ordem</Label>
                <Input
                  type="number"
                  value={form.ordem}
                  onChange={(e) => set("ordem", Number(e.target.value))}
                  className="h-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Título</Label>
              <Input
                value={form.titulo}
                onChange={(e) => set("titulo", e.target.value)}
                className="h-9"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Módulo</Label>
                <Select value={form.modulo_slug} onValueChange={(v) => set("modulo_slug", v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Módulo" />
                  </SelectTrigger>
                  <SelectContent>
                    {(dims.data?.modulos ?? []).map((m) => (
                      <SelectItem key={m.slug} value={m.slug}>
                        {m.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Entidade</Label>
                <Select value={form.entidade} onValueChange={(v) => set("entidade", v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Entidade" />
                  </SelectTrigger>
                  <SelectContent>
                    {(dims.data?.entidades ?? []).map((e) => (
                      <SelectItem key={e.codigo} value={e.codigo}>
                        {e.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Severidade</Label>
                <Select value={form.severidade} onValueChange={(v) => set("severidade", v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Severidade" />
                  </SelectTrigger>
                  <SelectContent>
                    {(dims.data?.severidades ?? []).map((s) => (
                      <SelectItem key={s.codigo} value={s.codigo}>
                        {s.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Modo</Label>
                <Select value={form.modo} onValueChange={(v) => set("modo", v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Modo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="achado">achado</SelectItem>
                    <SelectItem value="contagem">contagem</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">O que significa</Label>
              <Textarea
                value={form.o_que_significa}
                onChange={(e) => set("o_que_significa", e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Rota de conserto</Label>
                <Input
                  value={form.rota_acao}
                  onChange={(e) => set("rota_acao", e.target.value)}
                  placeholder="/recebimento/cobranca"
                  className="h-9 font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Rótulo da ação</Label>
                <Input
                  value={form.rotulo_acao}
                  onChange={(e) => set("rotulo_acao", e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Orçamento (ms)</Label>
                <Input
                  type="number"
                  value={form.orcamento_ms}
                  onChange={(e) => set("orcamento_ms", Number(e.target.value))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Observação</Label>
                <Input
                  value={form.observacao}
                  onChange={(e) => set("observacao", e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm">Ativa</Label>
                <p className="text-xs text-muted-foreground">
                  {podeAtivar
                    ? "Teste válido — pode ativar."
                    : "Precisa de um teste válido antes de ativar."}
                </p>
              </div>
              <Switch
                checked={form.ativo}
                disabled={!podeAtivar}
                onCheckedChange={(v) => set("ativo", v)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">SQL do achado</Label>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 text-xs"
                  onClick={rodarTeste}
                  disabled={testar.isPending || criando}
                >
                  {testar.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FlaskConical className="h-3.5 w-3.5" />
                  )}
                  Testar
                </Button>
              </div>
              <Textarea
                value={form.sql_achado}
                onChange={(e) => set("sql_achado", e.target.value)}
                rows={12}
                spellCheck={false}
                className="font-mono text-xs"
              />
              <div className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">Contrato do modo {form.modo}:</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {ajuda.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                <p className="mt-1">
                  Severidade, módulo e rota de conserto vêm da regra, não do SQL.
                </p>
              </div>
            </div>

            {sqlMudou && regra?.ativo && (
              <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                <p>
                  Você editou o SQL de uma regra ativa. Ao salvar, a regra será desativada
                  automaticamente e <strong>o teste anterior perdeu a validade</strong>. Teste de
                  novo antes de reativar.
                </p>
              </div>
            )}

            {teste && (
              <div className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge
                    variant="outline"
                    className={
                      teste.ok
                        ? "border-success/30 bg-success/10 text-success"
                        : "border-destructive/30 bg-destructive/10 text-destructive"
                    }
                  >
                    {teste.ok ? "Teste válido" : "Teste falhou"}
                  </Badge>
                  {teste.linhas != null && <span>{teste.linhas} linha(s)</span>}
                  {teste.contagem != null && <span>contagem: {teste.contagem}</span>}
                  {teste.duracao_ms != null && <span>{teste.duracao_ms} ms</span>}
                </div>
                {teste.colunas && teste.colunas.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Colunas: <span className="font-mono">{teste.colunas.join(", ")}</span>
                  </p>
                )}
                {teste.aviso && <p className="text-xs text-warning-foreground">{teste.aviso}</p>}
                {teste.erro && <p className="text-xs text-destructive">{teste.erro}</p>}
                {teste.amostra && teste.amostra.length > 0 && (
                  <div className="max-h-64 overflow-auto rounded border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {Object.keys(teste.amostra[0]).map((c) => (
                            <TableHead key={c} className="text-[11px]">
                              {c}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {teste.amostra.map((linha, i) => (
                          <TableRow key={i}>
                            {Object.keys(teste.amostra![0]).map((c) => (
                              <TableCell key={c} className="font-mono text-[11px]">
                                {linha[c] === null || linha[c] === undefined
                                  ? "—"
                                  : typeof linha[c] === "object"
                                    ? JSON.stringify(linha[c])
                                    : String(linha[c])}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvar.isPending}>
            Cancelar
          </Button>
          <Button onClick={submeter} disabled={salvar.isPending} className="gap-2">
            {salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {criando ? "Criar regra (inativa)" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
