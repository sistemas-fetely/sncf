import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Megaphone, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { CardCelebracao, temas } from "@/components/mural/CardCelebracao";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Publicacao } from "@/hooks/useMural";
import { formatError } from "@/lib/format-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const SLUG = "acao.mural_publicar";
const QK = ["mural-admin"] as const;

const TIPOS: Record<string, string> = {
  celebracao_pessoa: "Celebração de pessoa",
  celebracao_tempo_casa: "Tempo de casa",
  celebracao_promocao: "Promoção",
  celebracao_kpi: "Meta atingida",
  celebracao_marca: "Marco da marca",
  celebracao_aprendizado: "Aprendizado",
  celebracao_reconhecimento: "Reconhecimento",
  comunicado_convite: "Comunicado / convite",
};
const TIPOS_MANUAIS = Object.keys(TIPOS).filter((t) => t !== "celebracao_tempo_casa");

const STATUS: Record<string, string> = {
  rascunho: "Rascunho",
  pendente_aprovacao: "Pendente de aprovação",
  publicada: "Publicada",
  agendada: "Agendada",
  arquivada: "Arquivada",
  rejeitada: "Rejeitada",
};

type Filtro = "publicada" | "rascunho" | "arquivada" | "todas";

interface Linha {
  id: string;
  tipo: string;
  subtipo: string | null;
  titulo: string;
  mensagem: string | null;
  emoji: string | null;
  foto_url: string | null;
  pessoa_alvo_id: string | null;
  pessoa_alvo_nome: string | null;
  pessoa_alvo_tipo: string | null;
  cor_tema: string | null;
  data_evento: string | null;
  publicado_em: string | null;
  expira_em: string | null;
  fixado: boolean | null;
  origem: string;
  status: string;
  created_at: string;
}

function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
function somarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dataSP(ts: string | null): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(ts));
}
function isoSP(ts: string | null): string {
  if (!ts) return somarDias(hojeSP(), 7);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(ts));
}

interface Form {
  id: string | null;
  tipo: string;
  titulo: string;
  mensagem: string;
  emoji: string;
  pessoa: string;
  pessoaId: string | null;
  pessoaTipo: string | null;
  fotoUrl: string | null;
  ate: string;
  fixado: boolean;
  cor_tema: string;
}
const formVazio = (): Form => ({
  id: null, tipo: "celebracao_pessoa", titulo: "", mensagem: "", emoji: "", pessoa: "",
  pessoaId: null, pessoaTipo: null, fotoUrl: null,
  ate: somarDias(hojeSP(), 7), fixado: false, cor_tema: "rosa",
});

const CORES: { valor: string; rotulo: string }[] = [
  { valor: "rosa", rotulo: "Rosa" },
  { valor: "verde", rotulo: "Verde" },
  { valor: "creme", rotulo: "Creme" },
  { valor: "sage", rotulo: "Sálvia" },
  { valor: "bordo", rotulo: "Bordô" },
];

interface PessoaHomenagear {
  pessoa_id: string;
  nome: string;
  nome_curto: string | null;
  foto_url: string | null;
  alvo_tipo: string | null;
}

function iniciais(nome: string): string {
  return nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

function PessoaCombobox({ form, onChange }: { form: Form; onChange: (f: Form) => void }) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const pessoas = useQuery({
    queryKey: ["mural-pessoas-homenagear"],
    queryFn: async (): Promise<PessoaHomenagear[]> => {
      const { data, error } = await supabase.rpc("fn_mural_pessoas_para_homenagear");
      if (error) throw error;
      return (data ?? []) as PessoaHomenagear[];
    },
    staleTime: 60_000,
  });

  const livre = busca.trim();
  const escolherPessoa = (p: PessoaHomenagear) => {
    onChange({
      ...form,
      pessoa: p.nome,
      pessoaId: p.pessoa_id,
      pessoaTipo: p.alvo_tipo,
      fotoUrl: form.fotoUrl ?? p.foto_url,
    });
    setOpen(false);
  };
  const escolherLivre = () => {
    onChange({ ...form, pessoa: livre, pessoaId: null, pessoaTipo: null });
    setOpen(false);
  };
  const limpar = () => onChange({ ...form, pessoa: "", pessoaId: null, pessoaTipo: null, fotoUrl: null });

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            className={cn("w-full justify-between font-normal", !form.pessoa && "text-muted-foreground")}
          >
            <span className="truncate">{form.pessoa || "Buscar pessoa ou digitar nome..."}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar pessoa..." value={busca} onValueChange={setBusca} />
            <CommandList className="max-h-[320px]">
              {pessoas.error ? (
                <p className="p-3 text-sm text-destructive">Erro ao carregar pessoas: {formatError(pessoas.error)}</p>
              ) : (
                <>
                  <CommandEmpty>Nenhuma pessoa encontrada.</CommandEmpty>
                  <CommandGroup heading="Pessoas">
                    {(pessoas.data ?? []).map((p) => (
                      <CommandItem
                        key={p.pessoa_id}
                        value={p.nome}
                        onSelect={() => escolherPessoa(p)}
                      >
                        <Check className={cn("mr-2 h-4 w-4", form.pessoaId === p.pessoa_id ? "opacity-100" : "opacity-0")} />
                        <Avatar className="mr-2 h-6 w-6">
                          <AvatarImage src={p.foto_url ?? undefined} alt={p.nome} />
                          <AvatarFallback className="text-[10px]">{iniciais(p.nome)}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{p.nome}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  {livre && (
                    <CommandGroup heading="Sem vínculo">
                      <CommandItem value={`__livre__${livre}`} onSelect={escolherLivre}>
                        <span className="text-sm">Usar “{livre}” sem vincular a uma pessoa</span>
                      </CommandItem>
                    </CommandGroup>
                  )}
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {form.pessoa && (
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" title="Limpar escolha" onClick={limpar}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export default function MuralAdmin() {
  const { user, roles } = useAuth();
  const isSuper = (roles ?? []).includes("super_admin");
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>("publicada");
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [excluir, setExcluir] = useState<Linha | null>(null);

  const lista = useQuery({
    queryKey: [...QK, filtro],
    queryFn: async (): Promise<Linha[]> => {
      let q = supabase
        .from("mural_publicacoes")
        .select("id, tipo, subtipo, titulo, mensagem, emoji, foto_url, pessoa_alvo_id, pessoa_alvo_nome, pessoa_alvo_tipo, cor_tema, data_evento, publicado_em, expira_em, fixado, origem, status, created_at")
        .order("created_at", { ascending: false });
      if (filtro !== "todas") q = q.eq("status", filtro);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Linha[];
    },
  });

  const linhas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (lista.data ?? []).filter((l) => !t || l.titulo.toLowerCase().includes(t));
  }, [lista.data, busca]);

  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: QK });
    void qc.invalidateQueries({ queryKey: ["mural-ativas"] });
  };

  const salvar = useMutation({
    mutationFn: async ({ f, publicar }: { f: Form; publicar: boolean }) => {
      const base = {
        tipo: f.tipo,
        titulo: f.titulo.trim(),
        mensagem: f.mensagem.trim(),
        emoji: f.emoji.trim() || null,
        pessoa_alvo_id: f.pessoaId,
        pessoa_alvo_nome: f.pessoa.trim() || null,
        pessoa_alvo_tipo: f.pessoaTipo,
        foto_url: f.fotoUrl,
        cor_tema: f.cor_tema,
        expira_em: `${f.ate}T23:59:00-03:00`,
        fixado: f.fixado,
        ...(publicar
          ? { status: "publicada", publicado_em: new Date().toISOString(), data_evento: hojeSP() }
          : { status: "rascunho" }),
      };
      if (f.id) {
        const { error } = await supabase.from("mural_publicacoes").update(base).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("mural_publicacoes")
          .insert({ ...base, origem: "rh_manual", criado_por: user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: (_, { publicar }) => {
      toast.success(publicar ? "Publicação no ar." : "Rascunho salvo.");
      setForm(null);
      invalidar();
    },
    onError: (e) => toast.error(`Não foi possível salvar: ${formatError(e)}`),
  });

  const mudarStatus = useMutation({
    mutationFn: async ({ l, status }: { l: Linha; status: string }) => {
      const patch: { status: string; publicado_em?: string; data_evento?: string } = { status };
      if (status === "publicada" && l.status === "rascunho") {
        patch.publicado_em = new Date().toISOString();
        patch.data_evento = hojeSP();
      }
      const { error } = await supabase.from("mural_publicacoes").update(patch).eq("id", l.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Situação atualizada."); invalidar(); },
    onError: (e) => toast.error(`Não foi possível atualizar: ${formatError(e)}`),
  });

  const apagar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("mural_publicacoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Publicação excluída."); setExcluir(null); invalidar(); },
    onError: (e) => toast.error(`Não foi possível excluir: ${formatError(e)}`),
  });

  const abrirEdicao = (l: Linha) =>
    setForm({
      id: l.id, tipo: l.tipo, titulo: l.titulo, mensagem: l.mensagem ?? "", emoji: l.emoji ?? "",
      pessoa: l.pessoa_alvo_nome ?? "", pessoaId: l.pessoa_alvo_id, pessoaTipo: l.pessoa_alvo_tipo, fotoUrl: l.foto_url,
      ate: isoSP(l.expira_em), fixado: !!l.fixado, cor_tema: l.cor_tema ?? "rosa",
    });

  const previa: Publicacao | null = form
    ? {
        id: "previa", tipo: form.tipo, subtipo: null, titulo: form.titulo || "Título da publicação",
        mensagem: form.mensagem || null, emoji: form.emoji || null, foto_url: form.fotoUrl,
        pessoa_alvo_nome: form.pessoa || null, pessoa_alvo_tipo: form.pessoaTipo, cor_tema: form.cor_tema,
        data_evento: null, publicado_em: new Date().toISOString(), fixado: form.fixado,
      }
    : null;

  const formValido = !!form && form.titulo.trim() !== "" && form.mensagem.trim() !== "" && !!form.ate;

  return (
    <PageShell>
      <PageHeader
        titulo="Mural Fetely"
        icone={Megaphone}
        estado={lista.data ? `${lista.data.length} publicação(ões) nesta situação` : undefined}
        acoes={
          <BotaoGuardado slug={SLUG} rotuloAcao="Nova publicação no mural" onClick={() => setForm(formVazio())}>
            <Plus className="mr-1 h-4 w-4" /> Nova publicação
          </BotaoGuardado>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
          <TabsList>
            <TabsTrigger value="publicada">Publicadas</TabsTrigger>
            <TabsTrigger value="rascunho">Rascunhos</TabsTrigger>
            <TabsTrigger value="arquivada">Arquivadas</TabsTrigger>
            <TabsTrigger value="todas">Todas</TabsTrigger>
          </TabsList>
        </Tabs>
        <Input className="max-w-xs" placeholder="Buscar por título" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          {lista.isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Carregando...</p>
          ) : lista.error ? (
            <p className="p-6 text-sm text-destructive">Erro ao carregar: {formatError(lista.error)}</p>
          ) : linhas.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Nenhuma publicação nesta situação.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Publicação</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Homenageada</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Publicado em</TableHead>
                  <TableHead>Expira em</TableHead>
                  <TableHead>Fixado</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => {
                  const auto = l.origem === "automatico";
                  const vencida = !l.expira_em || new Date(l.expira_em).getTime() <= Date.now();
                  const ocupado = mudarStatus.isPending;
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.emoji ? `${l.emoji} ` : ""}{l.titulo}</TableCell>
                      <TableCell>{TIPOS[l.tipo] ?? l.tipo}</TableCell>
                      <TableCell>{l.pessoa_alvo_nome ?? "—"}</TableCell>
                      <TableCell>{auto ? "Automática" : "Manual"}</TableCell>
                      <TableCell><Badge variant="outline">{STATUS[l.status] ?? l.status}</Badge></TableCell>
                      <TableCell>{dataSP(l.publicado_em)}</TableCell>
                      <TableCell>{dataSP(l.expira_em)}</TableCell>
                      <TableCell>{l.fixado ? "Sim" : "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-1">
                          {!auto && (
                            <BotaoGuardado slug={SLUG} rotuloAcao="Editar publicação do mural" size="sm" variant="ghost" onClick={() => abrirEdicao(l)}>
                              Editar
                            </BotaoGuardado>
                          )}
                          {l.status === "rascunho" && (
                            <BotaoGuardado slug={SLUG} rotuloAcao="Publicar no mural" size="sm" variant="ghost" disabled={ocupado}
                              onClick={() => mudarStatus.mutate({ l, status: "publicada" })}>
                              Publicar
                            </BotaoGuardado>
                          )}
                          {l.status === "publicada" && (
                            <BotaoGuardado slug={SLUG} rotuloAcao="Arquivar publicação do mural" size="sm" variant="ghost" disabled={ocupado}
                              onClick={() => mudarStatus.mutate({ l, status: "arquivada" })}>
                              Arquivar
                            </BotaoGuardado>
                          )}
                          {l.status === "arquivada" && (
                            <span title={vencida ? "Vencida — edite a data para reativar" : undefined}>
                              <BotaoGuardado slug={SLUG} rotuloAcao="Reativar publicação do mural" size="sm" variant="ghost"
                                disabled={vencida || ocupado}
                                onClick={() => mudarStatus.mutate({ l, status: "publicada" })}>
                                Reativar
                              </BotaoGuardado>
                            </span>
                          )}
                          <span title={isSuper ? undefined : "Só super_admin pode excluir publicações"}>
                            <Button size="sm" variant="ghost" className="text-destructive" disabled={!isSuper} onClick={() => setExcluir(l)}>
                              Excluir
                            </Button>
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar publicação" : "Nova publicação"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="grid items-start gap-6 md:grid-cols-[1fr_320px]">
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Tipo</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_MANUAIS.map((t) => <SelectItem key={t} value={t}>{TIPOS[t]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Título *</Label>
                  <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Mensagem *</Label>
                  <Textarea rows={4} value={form.mensagem} onChange={(e) => setForm({ ...form, mensagem: e.target.value })} />
                </div>
                <div className="grid grid-cols-[96px_1fr] gap-3">
                  <div className="space-y-1">
                    <Label>Emoji</Label>
                    <Input maxLength={8} value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Pessoa homenageada (opcional)</Label>
                    <PessoaCombobox form={form} onChange={setForm} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Cor do cartão</Label>
                  <div className="flex items-center gap-2 pt-1">
                    {CORES.map((c) => {
                      const t = temas[c.valor] ?? temas.rosa;
                      const ativa = form.cor_tema === c.valor;
                      return (
                        <button
                          key={c.valor}
                          type="button"
                          title={c.rotulo}
                          aria-label={`Cor ${c.rotulo}`}
                          onClick={() => setForm({ ...form, cor_tema: c.valor })}
                          className={cn(
                            "h-8 w-8 rounded-full border-2 transition-all",
                            t.bg, t.border,
                            ativa ? "ring-2 ring-foreground/60 ring-offset-2 ring-offset-background" : "opacity-70 hover:opacity-100",
                          )}
                        />
                      );
                    })}
                    <span className="ml-1 text-xs text-muted-foreground">
                      {CORES.find((c) => c.valor === form.cor_tema)?.rotulo ?? form.cor_tema}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-6">
                  <div className="space-y-1">
                    <Label>Fica no ar até</Label>
                    <Input type="date" value={form.ate} onChange={(e) => setForm({ ...form, ate: e.target.value })} />
                  </div>
                  <label className="flex items-center gap-2 pb-2 text-sm">
                    <Switch checked={form.fixado} onCheckedChange={(v) => setForm({ ...form, fixado: v })} />
                    Fixar no topo
                  </label>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Prévia</p>
                {previa && <CardCelebracao publicacao={previa} />}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            <BotaoGuardado slug={SLUG} rotuloAcao="Salvar rascunho do mural" variant="outline"
              disabled={!formValido || salvar.isPending}
              onClick={() => form && salvar.mutate({ f: form, publicar: false })}>
              Salvar rascunho
            </BotaoGuardado>
            <BotaoGuardado slug={SLUG} rotuloAcao="Publicar no mural"
              disabled={!formValido || salvar.isPending}
              onClick={() => form && salvar.mutate({ f: form, publicar: true })}>
              Publicar
            </BotaoGuardado>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!excluir} onOpenChange={(o) => !o && setExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir publicação?</AlertDialogTitle>
            <AlertDialogDescription>
              “{excluir?.titulo}” será apagada de vez. Para só tirar do ar, use Arquivar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={apagar.isPending}
              onClick={(e) => { e.preventDefault(); if (excluir) apagar.mutate(excluir.id); }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
