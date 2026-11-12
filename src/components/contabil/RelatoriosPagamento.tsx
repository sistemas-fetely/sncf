import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Selo } from "@/components/ui/selo";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePermissaoAcao } from "@/hooks/usePermissaoAcao";
import { nomeSeguro, sha256Hex, baixarOriginalComoArquivo } from "@/lib/contabil/arquivoOriginal";
import { mesesRelatorioPagamento, tiposPagamentoDaConta } from "@/lib/contabil/relatoriosPagamento";
import { rawMessage } from "@/lib/format-error";
import { useDocumentosDespesa } from "./DocumentosDespesaMes";

export function RelatoriosPagamento({ competencia, conta }: { competencia: string; conta: string }) {
  const q = useDocumentosDespesa(competencia), qc = useQueryClient();
  const { permitido } = usePermissaoAcao("acao.contabil_documento_despesa.enviar");
  const [outro, setOutro] = useState<{ tipo: string; mes: string; file: File | null } | null>(null);
  const meses = mesesRelatorioPagamento(new Date());
  const tipos = tiposPagamentoDaConta(q.data?.tipos ?? [], conta);
  const enviar = useMutation({
    mutationFn: async ({ file, tipo, mes }: { file: File; tipo: string; mes: string }) => {
      const hash = await sha256Hex(await file.arrayBuffer());
      const path = `despesas/${mes.slice(0, 7)}/pagamentos/${crypto.randomUUID()}-${nomeSeguro(file.name)}`;
      const { error: up } = await supabase.storage.from("contabil").upload(path, file, { upsert: false });
      if (up) throw up;
      const { error } = await supabase.rpc("fn_contabil_documento_despesa_guardar", { p_competencia: mes, p_tipo_id: tipo, p_pasta: "pagamentos", p_storage_path: path, p_nome: file.name, p_sha256: hash, p_bytes: file.size });
      if (error) throw new Error(`Arquivo guardado, mas registro falhou: ${error.message}`);
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["contabil-documentos-despesa"] }); setOutro(null); toast.success("Relatório de pagamentos guardado"); },
    onError: e => toast.error(rawMessage(e), { duration: Infinity, closeButton: true }),
  });
  async function baixar(path: string, nome: string) {
    try { const file = await baixarOriginalComoArquivo(path, nome); const url = URL.createObjectURL(file); const a = document.createElement("a"); a.href = url; a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch (e) { toast.error(rawMessage(e)); }
  }
  if (q.error) return <p className="mt-4 text-xs text-destructive">{rawMessage(q.error)}</p>;
  return <>{tipos.map(t => <div key={t.id} className="mt-4 min-w-0 space-y-2 border-t pt-4" aria-label={`Relatório de pagamentos ${t.nome}`}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-medium">Relatório de pagamentos</h4><Selo estado={t.enviado ? "success" : "warning"}>{t.enviado ? "Guardado" : "Falta"}</Selo></div>
    <p className="break-words text-xs text-muted-foreground">{t.nome}</p>
    {t.documento && <p className="break-all text-xs">{t.documento.nome_arquivo}</p>}
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!permitido || enviar.isPending} onClick={() => document.getElementById(`pagamento-${t.id}`)?.click()}><Upload className="mr-1.5 h-4 w-4" />{enviar.isPending ? "Guardando…" : t.enviado ? "Substituir" : "Enviar"}</Button>
      <input id={`pagamento-${t.id}`} aria-label={`Enviar relatório ${t.nome}`} type="file" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) enviar.mutate({ file, tipo: t.id, mes: competencia }); e.target.value = ""; }} />
      {t.documento && <Button size="sm" variant="ghost" onClick={() => { if (t.documento) void baixar(t.documento.storage_path, t.documento.nome_arquivo); }}><Download className="mr-1.5 h-4 w-4" />Baixar</Button>}
    </div>
    <Button size="sm" variant="link" className="h-auto p-0 text-xs" disabled={!permitido || enviar.isPending} onClick={() => setOutro({ tipo: t.id, mes: competencia, file: null })}>Guardar de outro mês</Button>
  </div>)}
    <Dialog open={!!outro} onOpenChange={o => { if (!o && !enviar.isPending) setOutro(null); }}><DialogContent><DialogHeader><DialogTitle>Relatório de pagamentos de outro mês</DialogTitle></DialogHeader>
      {outro && <div className="space-y-3"><div><Label>Mês</Label><Select value={outro.mes} onValueChange={mes => setOutro({ ...outro, mes })}><SelectTrigger aria-label="Mês do relatório"><SelectValue /></SelectTrigger><SelectContent>{meses.map(m => <SelectItem key={m} value={m}>{m.slice(5, 7)}/{m.slice(0, 4)}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor={`pagamento-outro-${conta}`}>Arquivo</Label><Input id={`pagamento-outro-${conta}`} type="file" onChange={e => setOutro({ ...outro, file: e.target.files?.[0] ?? null })} /></div></div>}
      <DialogFooter><Button variant="outline" disabled={enviar.isPending} onClick={() => setOutro(null)}>Cancelar</Button><Button disabled={!permitido || !outro?.file || enviar.isPending} onClick={() => { if (outro?.file) enviar.mutate({ file: outro.file, tipo: outro.tipo, mes: outro.mes }); }}>{enviar.isPending ? "Guardando…" : "Guardar"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}
