import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Pencil, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Selo } from "@/components/ui/selo";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePermissaoAcao } from "@/hooks/usePermissaoAcao";
import { nomeSeguro, sha256Hex, baixarOriginalComoArquivo } from "@/lib/contabil/arquivoOriginal";
import { rawMessage } from "@/lib/format-error";
import { statusDocumentoEsperado, type DocDespesa, type TipoDespesa } from "@/lib/contabil/documentosDespesa";

const PASTAS = [{ v: "consumo", r: "Consumo (energia, água, telefone)" }, { v: "aluguel", r: "Aluguel (contrato e recibos)" }, { v: "cupons", r: "Cupons fiscais" }, { v: "outros", r: "Outros" }];
const PERIODOS = [{ v: "mensal", r: "Todo mês" }, { v: "contrato_vigente", r: "Uma vez enquanto vigente (contrato)" }];
const vazio = { id: null as string | null, nome: "", pasta: "consumo", periodicidade: "mensal", local: "", ativo: true };

export function useDocumentosDespesa(competencia: string | null) {
  return useQuery({
    queryKey: ["contabil-documentos-despesa", competencia], enabled: !!competencia,
    queryFn: async () => {
      if (!competencia) throw new Error("Selecione uma competência");
      const [tipos, docs] = await Promise.all([
        supabase.from("contabil_documento_despesa_tipo").select("*").order("nome"),
        supabase.from("contabil_documento_despesa").select("*").eq("vigente", true).lte("competencia", competencia).order("enviado_em", { ascending: false }),
      ]);
      if (tipos.error) throw tipos.error; if (docs.error) throw docs.error;
      const ds = (docs.data ?? []) as DocDespesa[];
      return {
        tipos: ((tipos.data ?? []) as TipoDespesa[]).map((t) => ({ ...t, ...statusDocumentoEsperado(t, ds, competencia) })),
        avulsos: ds.filter((d) => !d.tipo_id && d.competencia === competencia),
      };
    },
  });
}

async function baixar(path: string, nome: string) {
  try { const f = await baixarOriginalComoArquivo(path, nome); const u = URL.createObjectURL(f); const a = document.createElement("a"); a.href = u; a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
  catch (e) { toast.error(rawMessage(e)); }
}

export function DocumentosDespesaMes({ competencia }: { competencia: string }) {
  const q = useDocumentosDespesa(competencia), qc = useQueryClient();
  const { permitido: podeEnviar } = usePermissaoAcao("acao.contabil_documento_despesa.enviar");
  const { permitido: podeEditar } = usePermissaoAcao("acao.contabil_documento_despesa_tipo.editar");
  const [form, setForm] = useState<typeof vazio | null>(null);
  const [avulso, setAvulso] = useState<{ pasta: string; descricao: string; file: File | null } | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);

  const salvarTipo = useMutation({
    mutationFn: async (f: typeof vazio) => {
      const { error } = await supabase.rpc("fn_contabil_documento_despesa_tipo_salvar", { p_id: f.id ?? undefined, p_nome: f.nome, p_pasta: f.pasta, p_periodicidade: f.periodicidade, p_local: f.local, p_ativo: f.ativo });
      if (error) throw error;
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["contabil-documentos-despesa"] }); setForm(null); toast.success("Documento esperado salvo"); },
    onError: (e) => toast.error(rawMessage(e), { duration: Infinity, closeButton: true }),
  });
  const enviar = useMutation({
    mutationFn: async ({ file, tipo, pasta, descricao }: { file: File; tipo: string | null; pasta: string; descricao?: string }) => {
      const hash = await sha256Hex(await file.arrayBuffer());
      const path = `despesas/${competencia.slice(0, 7)}/${pasta}/${crypto.randomUUID()}-${nomeSeguro(file.name)}`;
      const { error: up } = await supabase.storage.from("contabil").upload(path, file, { upsert: false });
      if (up) throw up;
      const { error } = await supabase.rpc("fn_contabil_documento_despesa_guardar", { p_competencia: competencia, p_tipo_id: tipo ?? undefined, p_pasta: pasta, p_storage_path: path, p_nome: file.name, p_sha256: hash, p_bytes: file.size, p_descricao: descricao });
      if (error) throw new Error(`Arquivo guardado, mas registro falhou: ${error.message}`);
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["contabil-documentos-despesa"] }); setAvulso(null); toast.success("Documento guardado"); },
    onError: (e) => toast.error(rawMessage(e), { duration: Infinity, closeButton: true }),
  });

  const ativos = q.data?.tipos.filter((t) => t.ativo) ?? [];
  const inativos = q.data?.tipos.filter((t) => !t.ativo) ?? [];
  return (
    <section className="space-y-3" aria-label="Documentos de despesa do mês">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Documentos de despesa do mês</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!podeEditar} onClick={() => setForm({ ...vazio })}><Plus className="mr-1.5 h-4 w-4" />Documento esperado</Button>
          <Button size="sm" variant="outline" disabled={!podeEnviar} onClick={() => setAvulso({ pasta: "outros", descricao: "", file: null })}><Upload className="mr-1.5 h-4 w-4" />Outro documento</Button>
        </div>
      </div>
      {q.error ? <p className="text-sm text-destructive">{rawMessage(q.error)}</p> : q.isLoading ? <p className="text-sm text-muted-foreground">Carregando documentos…</p> : (
        <>
          {!ativos.length && <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground shadow-sm">Cadastre os documentos esperados do mês.</div>}
          {ativos.length > 0 && <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{ativos.map((t) => (
            <article key={t.id} aria-label={t.nome} className="min-w-0 rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium">{t.nome}</h3><Selo estado={t.enviado ? "success" : "warning"}>{t.enviado ? "Enviado" : "Falta"}</Selo></div>
              <p className="mt-1 text-xs text-muted-foreground">{PASTAS.find((p) => p.v === t.pasta)?.r}{t.local ? ` · ${t.local}` : ""} · {PERIODOS.find((p) => p.v === t.periodicidade)?.r}</p>
              {t.documento && <p className="mt-2 break-all text-xs">{t.documento.nome_arquivo}{t.documento.competencia !== competencia ? ` (enviado em ${t.documento.competencia.slice(5, 7)}/${t.documento.competencia.slice(0, 4)})` : ""}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={!podeEnviar || enviar.isPending} onClick={() => { setAlvo(t.id); document.getElementById(`desp-${t.id}`)?.click(); }}><Upload className="mr-1.5 h-4 w-4" />{enviar.isPending && alvo === t.id ? "Guardando…" : t.documento ? "Substituir" : "Enviar"}</Button>
                <input id={`desp-${t.id}`} aria-label={`Enviar ${t.nome}`} type="file" className="hidden" onChange={(ev) => { const f = ev.target.files?.[0]; if (f) enviar.mutate({ file: f, tipo: t.id, pasta: t.pasta }); ev.target.value = ""; }} />
                {t.documento && <Button size="sm" variant="ghost" onClick={() => baixar(t.documento!.storage_path, t.documento!.nome_arquivo)}><Download className="mr-1.5 h-4 w-4" />Baixar</Button>}
                <Button size="sm" variant="ghost" disabled={!podeEditar} aria-label={`Editar ${t.nome}`} onClick={() => setForm({ id: t.id, nome: t.nome, pasta: t.pasta, periodicidade: t.periodicidade, local: t.local ?? "", ativo: t.ativo })}><Pencil className="h-4 w-4" /></Button>
              </div>
            </article>
          ))}</div>}
          {(q.data?.avulsos.length ?? 0) > 0 && <div className="rounded-lg border bg-card p-4 shadow-sm"><h3 className="text-xs font-medium text-muted-foreground">Outros documentos do mês</h3>
            <ul className="mt-2 space-y-1 text-xs">{q.data!.avulsos.map((d) => <li key={d.id} className="flex flex-wrap items-center gap-2"><span className="break-all">{d.nome_arquivo}</span><span className="text-muted-foreground">{d.pasta}{d.descricao ? ` · ${d.descricao}` : ""}</span><Button size="sm" variant="ghost" onClick={() => baixar(d.storage_path, d.nome_arquivo)}><Download className="h-4 w-4" /></Button></li>)}</ul></div>}
          {inativos.length > 0 && <p className="text-xs text-muted-foreground">Inativos: {inativos.map((t) => <button key={t.id} type="button" className="mr-2 underline" disabled={!podeEditar} onClick={() => setForm({ id: t.id, nome: t.nome, pasta: t.pasta, periodicidade: t.periodicidade, local: t.local ?? "", ativo: t.ativo })}>{t.nome}</button>)}</p>}
        </>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form?.id ? "Editar documento esperado" : "Novo documento esperado"}</DialogTitle></DialogHeader>
          {form && <div className="space-y-3">
            <div><Label htmlFor="desp-nome">Nome</Label><Input id="desp-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div><Label>Pasta do ZIP</Label><Select value={form.pasta} onValueChange={(v) => setForm({ ...form, pasta: v })}><SelectTrigger aria-label="Pasta do ZIP"><SelectValue /></SelectTrigger><SelectContent>{PASTAS.map((p) => <SelectItem key={p.v} value={p.v}>{p.r}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Periodicidade</Label><Select value={form.periodicidade} onValueChange={(v) => setForm({ ...form, periodicidade: v })}><SelectTrigger aria-label="Periodicidade"><SelectValue /></SelectTrigger><SelectContent>{PERIODOS.map((p) => <SelectItem key={p.v} value={p.v}>{p.r}</SelectItem>)}</SelectContent></Select></div>
            <div><Label htmlFor="desp-local">Local</Label><Input id="desp-local" value={form.local} onChange={(e) => setForm({ ...form, local: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch id="desp-ativo" checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} /><Label htmlFor="desp-ativo">Ativo</Label></div>
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button><Button disabled={salvarTipo.isPending || !form || form.nome.trim().length < 3} onClick={() => form && salvarTipo.mutate(form)}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!avulso} onOpenChange={(o) => !o && setAvulso(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Outro documento de despesa</DialogTitle></DialogHeader>
          {avulso && <div className="space-y-3">
            <div><Label>Pasta do ZIP</Label><Select value={avulso.pasta} onValueChange={(v) => setAvulso({ ...avulso, pasta: v })}><SelectTrigger aria-label="Pasta do documento"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cupons">Cupons fiscais</SelectItem><SelectItem value="outros">Outros</SelectItem></SelectContent></Select></div>
            <div><Label htmlFor="avulso-desc">Descrição</Label><Input id="avulso-desc" value={avulso.descricao} onChange={(e) => setAvulso({ ...avulso, descricao: e.target.value })} /></div>
            <div><Label htmlFor="avulso-arq">Arquivo</Label><Input id="avulso-arq" type="file" onChange={(e) => setAvulso({ ...avulso, file: e.target.files?.[0] ?? null })} /></div>
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setAvulso(null)}>Cancelar</Button><Button disabled={!avulso?.file || enviar.isPending} onClick={() => avulso?.file && enviar.mutate({ file: avulso.file, tipo: null, pasta: avulso.pasta, descricao: avulso.descricao })}>{enviar.isPending ? "Guardando…" : "Guardar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
