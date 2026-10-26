import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, FileText, Loader2, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";

export interface NfFetelyOrfa {
  id: string;
  numero: string | null;
  serie: string | null;
  situacao: string | null;
  data_emissao: string | null;
  emitente_cnpj: string | null;
  origem_codigo: string | null;
  origem_rotulo: string | null;
  cfops: string[] | null;
  qtd_itens: number;
  pecas: number;
  valor_nota: number | null;
  pdf_url: string | null;
  ignorada: boolean;
  transferencia_ignorada_em: string | null;
  transferencia_ignorada_motivo: string | null;
}

export const CHAVE_NF_FETELY = ["vw_nf_fetely_orfa"];

export function useNfsFetelyOrfas() {
  return useQuery({
    queryKey: CHAVE_NF_FETELY,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_nf_fetely_orfa")
        .select("*")
        .order("data_emissao", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NfFetelyOrfa[];
    },
  });
}

function SituacaoBadge({ s }: { s: string | null }) {
  if (s === "autorizada") return <Badge variant="outline" className="border-success/40 text-success">Autorizada</Badge>;
  if (s === "pendente") return <Badge variant="outline" className="border-warning/40 text-warning">Pendente</Badge>;
  return <Badge variant="outline">{s ?? "—"}</Badge>;
}

export function NfsFetelySemPedidoPainel() {
  const qc = useQueryClient();
  const { data = [], isLoading, error } = useNfsFetelyOrfas();
  const [virar, setVirar] = useState<NfFetelyOrfa | null>(null);
  const [ignorar, setIgnorar] = useState<NfFetelyOrfa | null>(null);
  const [verIgnoradas, setVerIgnoradas] = useState(false);

  const abertas = data.filter((n) => !n.ignorada);
  const ignoradas = data.filter((n) => n.ignorada);

  const desfazer = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("fn_nf_fetely_desfazer_ignorar", { p_nf_id: id });
      if (error) throw error;
    },
    onSuccess: async () => { toast.success("NF voltou para a lista"); await qc.invalidateQueries({ queryKey: CHAVE_NF_FETELY }); },
    onError: (e) => toast.error(formatError(e)),
  });

  if (isLoading) return <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando NFs…</div>;
  if (error) return <div className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">Erro ao carregar NFs: {formatError(error)}</div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        NFs emitidas pela Fetely para ela mesma que não têm pedido no sistema. Decida uma a uma: virar transferência (a NF já existe, a TRS nasce em transporte) ou ignorar com motivo.
      </p>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>NF</TableHead>
              <TableHead>Emissão</TableHead>
              <TableHead>Emitente / Origem</TableHead>
              <TableHead>CFOP</TableHead>
              <TableHead className="text-right">Itens</TableHead>
              <TableHead className="text-right">Peças</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {abertas.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">Nenhuma NF Fetely→Fetely sem pedido.</TableCell></TableRow>
            ) : abertas.map((n) => (
              <TableRow key={n.id} data-foco-id={n.id}>
                <TableCell className="font-mono text-sm whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    {n.numero}{n.serie ? `/${n.serie}` : ""}
                    {n.pdf_url && (
                      <a href={n.pdf_url} target="_blank" rel="noreferrer" title="Abrir PDF" className="text-primary"><FileText className="h-3.5 w-3.5" /></a>
                    )}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap">{formatDateBR(n.data_emissao)}</TableCell>
                <TableCell>
                  <div className="text-sm">{n.origem_rotulo ?? <span className="text-destructive">CD não identificado</span>}</div>
                  <div className="text-xs text-muted-foreground font-mono">{n.emitente_cnpj ?? "—"}</div>
                </TableCell>
                <TableCell className="font-mono text-xs">{(n.cfops ?? []).join(", ") || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{n.qtd_itens}</TableCell>
                <TableCell className="text-right tabular-nums">{Number(n.pecas).toLocaleString("pt-BR")}</TableCell>
                <TableCell className="text-right tabular-nums">{formatBRL(n.valor_nota)}</TableCell>
                <TableCell><SituacaoBadge s={n.situacao} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {n.situacao !== "autorizada" ? (
                      <Tooltip>
                        <TooltipTrigger asChild><span><Button size="sm" disabled>Virar transferência</Button></span></TooltipTrigger>
                        <TooltipContent>NF {n.situacao ?? "sem situação"} — só NF autorizada pode virar transferência.</TooltipContent>
                      </Tooltip>
                    ) : (
                      <Button size="sm" onClick={() => setVirar(n)}>Virar transferência</Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setIgnorar(n)}>Ignorar</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <section className="rounded-lg border bg-card">
        <Button variant="ghost" onClick={() => setVerIgnoradas((v) => !v)} className="h-auto w-full justify-start gap-2 p-3 text-sm font-medium">
          {verIgnoradas ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Ignoradas ({ignoradas.length})
        </Button>
        {verIgnoradas && (
          <div className="p-3 pt-0">
            {ignoradas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma NF ignorada.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>NF</TableHead><TableHead>Origem</TableHead><TableHead>Motivo</TableHead><TableHead>Ignorada em</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {ignoradas.map((n) => (
                    <TableRow key={n.id}>
                      <TableCell className="font-mono text-sm">{n.numero}</TableCell>
                      <TableCell>{n.origem_rotulo ?? "—"}</TableCell>
                      <TableCell className="text-sm">{n.transferencia_ignorada_motivo}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDateBR(n.transferencia_ignorada_em?.slice(0, 10))}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" disabled={desfazer.isPending} onClick={() => desfazer.mutate(n.id)}>
                          <Undo2 className="h-4 w-4" /> Desfazer
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </section>

      {virar && <DialogoVirar nf={virar} onClose={() => setVirar(null)} />}
      {ignorar && <DialogoIgnorar nf={ignorar} onClose={() => setIgnorar(null)} />}
    </div>
  );
}

function DialogoIgnorar({ nf, onClose }: { nf: NfFetelyOrfa; onClose: () => void }) {
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("fn_nf_fetely_ignorar", { p_nf_id: nf.id, p_motivo: motivo.trim() });
      if (error) throw error;
    },
    onSuccess: async () => { toast.success(`NF ${nf.numero} ignorada`); await qc.invalidateQueries({ queryKey: CHAVE_NF_FETELY }); onClose(); },
    onError: (e) => toast.error(formatError(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && !m.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ignorar NF {nf.numero}</DialogTitle>
          <DialogDescription>A NF sai da lista e fica no rodapé "Ignoradas", de onde pode voltar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Motivo *</Label>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder='Ex.: "remessa", "carga inicial já contada", "NF cancelada/rascunho"' autoFocus />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={m.isPending}>Cancelar</Button>
          <BotaoGuardado slug="acao.transferencia_criar" rotuloAcao="Ignorar NF" disabled={!motivo.trim() || m.isPending} onClick={() => m.mutate()}>
            {m.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Ignorar
          </BotaoGuardado>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface Preview {
  ok: boolean; origem: string; destino: string; finalidade: string; pecas: number; qtd_itens: number;
  valor_custo: number; skus_faltando: string[];
  itens: { sku: string; descricao: string; quantidade: number; valor_unitario: number; existe_no_catalogo: boolean }[];
}

function DialogoVirar({ nf, onClose }: { nf: NfFetelyOrfa; onClose: () => void }) {
  const qc = useQueryClient();
  const [destino, setDestino] = useState("");
  const [finalidade, setFinalidade] = useState("");
  const [obs, setObs] = useState("");

  const destinos = useQuery({
    queryKey: ["cds_destino_transferencia"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("centro_distribuicao")
        .select("codigo, rotulo_curto").eq("ativo", true).in("tipo", ["armazem", "showroom"]).order("rotulo_curto");
      if (error) throw error;
      return (data ?? []) as { codigo: string; rotulo_curto: string }[];
    },
  });
  const finalidades = useQuery({
    queryKey: ["transferencia_finalidade", "manuais"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("transferencia_finalidade")
        .select("codigo, rotulo, exige_descricao").eq("ativo", true).eq("automatica", false).order("ordem");
      if (error) throw error;
      return (data ?? []) as { codigo: string; rotulo: string; exige_descricao: boolean }[];
    },
  });

  const pronto = !!destino && !!finalidade;
  const preview = useQuery({
    queryKey: ["nf_fetely_preview", nf.id, destino, finalidade, obs.trim() ? "obs" : ""],
    enabled: pronto,
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("fn_nf_fetely_virar_transferencia", {
        p_nf_id: nf.id, p_destino_codigo: destino, p_finalidade_codigo: finalidade, p_observacao: obs.trim() || null, p_dry_run: true,
      });
      if (error) throw error;
      return data as Preview;
    },
  });

  const confirmar = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("fn_nf_fetely_virar_transferencia", {
        p_nf_id: nf.id, p_destino_codigo: destino, p_finalidade_codigo: finalidade, p_observacao: obs.trim() || null, p_dry_run: false,
      });
      if (error) throw error;
      return data as { id_externo: string };
    },
    onSuccess: async (r) => {
      toast.success(`${r.id_externo} criada a partir da NF ${nf.numero} — em transporte`);
      await qc.invalidateQueries();
      onClose();
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const p = preview.data;
  const bloqueado = !p || !p.ok || (p.skus_faltando?.length ?? 0) > 0 || confirmar.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && !confirmar.isPending && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Virar transferência · NF {nf.numero}</DialogTitle>
          <DialogDescription>A NF já foi emitida: a TRS nasce em transporte, não vai ao Bling nem à XPM. A entrada no destino segue pelo "Receber no destino".</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Origem</Label>
            <div className="h-10 rounded-md border bg-muted/40 px-3 flex items-center text-sm">{nf.origem_rotulo ?? "Não identificada"}</div>
          </div>
          <div className="space-y-1.5">
            <Label>Destino *</Label>
            <Select value={destino} onValueChange={setDestino}>
              <SelectTrigger><SelectValue placeholder="Escolha o CD" /></SelectTrigger>
              <SelectContent>
                {(destinos.data ?? []).filter((d) => d.codigo !== nf.origem_codigo).map((d) => (
                  <SelectItem key={d.codigo} value={d.codigo}>{d.rotulo_curto}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Finalidade *</Label>
            <Select value={finalidade} onValueChange={setFinalidade}>
              <SelectTrigger><SelectValue placeholder="Escolha a finalidade" /></SelectTrigger>
              <SelectContent>
                {(finalidades.data ?? []).map((f) => <SelectItem key={f.codigo} value={f.codigo}>{f.rotulo}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Observação</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
          </div>
        </div>
        {(destinos.error || finalidades.error) && (
          <p className="text-sm text-destructive">{formatError(destinos.error ?? finalidades.error)}</p>
        )}

        <div className="rounded-md border p-3 space-y-2 text-sm">
          {!pronto ? <p className="text-muted-foreground">Escolha destino e finalidade para ver a prévia.</p>
          : preview.isFetching ? <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Calculando prévia…</p>
          : preview.error ? <p className="text-destructive">{formatError(preview.error)}</p>
          : p && (
            <>
              <p><strong>{p.origem} → {p.destino}</strong> · {p.qtd_itens} itens · {Number(p.pecas).toLocaleString("pt-BR")} peças · {formatBRL(p.valor_custo)} a custo</p>
              {p.skus_faltando.length > 0 && (
                <p className="text-destructive">SKU(s) fora do catálogo — cadastre antes: {p.skus_faltando.join(", ")}</p>
              )}
              <div className="max-h-48 overflow-y-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Qtd</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {p.itens.map((i, k) => (
                      <TableRow key={k} className={i.existe_no_catalogo ? "" : "text-destructive"}>
                        <TableCell className="font-mono text-xs">{i.sku}</TableCell>
                        <TableCell className="text-xs">{i.descricao}</TableCell>
                        <TableCell className="text-right tabular-nums">{i.quantidade}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={confirmar.isPending}>Cancelar</Button>
          <BotaoGuardado slug="acao.transferencia_criar" rotuloAcao="Criar transferência interna" disabled={bloqueado} onClick={() => confirmar.mutate()}>
            {confirmar.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Criar TRS em transporte
          </BotaoGuardado>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
