import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { parsePrazosCondicao, podeSalvarCondicaoRapida, type SituacaoPreviaCondicao } from "@/lib/financeiro/condicaoPagamentoRapida";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface PreviaCondicao {
  slug: string;
  rotulo: string;
  canonica: string;
  regra_codigo: string;
  situacao: SituacaoPreviaCondicao;
  parcelas: { numero: number; dias: number; valor: number; vencimento: string }[];
  entrada: { dias: number; valor: number } | null;
}

export function CondicaoPagamentoRapidaDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [forma, setForma] = useState<"boleto" | "cartao">("boleto");
  const [prazos, setPrazos] = useState("");
  const [rotulo, setRotulo] = useState("");
  const [personalizar, setPersonalizar] = useState(false);
  const assinatura = JSON.stringify([forma, prazos, rotulo.trim()]);
  const [debounced, setDebounced] = useState(assinatura);
  const savingRef = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(assinatura), 400);
    return () => window.clearTimeout(timer);
  }, [assinatura]);
  const dias = parsePrazosCondicao(prazos);
  const atualizada = assinatura === debounced;
  const previa = useQuery({
    queryKey: ["condicao-pagamento-rapida-previa", debounced],
    enabled: atualizada && dias !== null && dias.length > 0,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("condicao_pagamento_criar_rapida", {
        p_forma: forma, p_dias: dias ?? [], p_preview: true,
        ...(rotulo.trim() ? { p_rotulo: rotulo.trim() } : {}),
      });
      if (error) throw error;
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("O banco não retornou a prévia da condição.");
      return data as unknown as PreviaCondicao;
    },
  });
  const salvar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("condicao_pagamento_criar_rapida", {
        p_forma: forma, p_dias: dias ?? [], p_preview: false,
        ...(rotulo.trim() ? { p_rotulo: rotulo.trim() } : {}),
      });
      if (error) throw error;
      if (!data || typeof data !== "object" || Array.isArray(data) || typeof data.rotulo !== "string" ||
        (data.situacao !== "criada" && data.situacao !== "reativada")) throw new Error("O banco não confirmou o cadastro da condição.");
      return { rotulo: data.rotulo, situacao: data.situacao };
    },
    onSuccess: async (data) => {
      await qc.invalidateQueries();
      toast.success(`Condição ${data.rotulo} ${data.situacao}`);
      onClose();
    },
  });
  const habilitado = podeSalvarCondicaoRapida(
    previa.data?.situacao, atualizada && dias !== null && dias.length > 0 && !previa.isError,
    previa.isFetching || salvar.isPending,
  );
  async function handleSalvar() {
    if (!habilitado || savingRef.current) return;
    savingRef.current = true;
    try { await salvar.mutateAsync(); }
    catch (error) { toast.error(formatError(error)); }
    finally { savingRef.current = false; }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !savingRef.current) onClose(); }}>
      <DialogContent className={`max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto ${salvar.isPending ? "[&>button]:hidden" : ""}`}
        aria-describedby={undefined}
        onEscapeKeyDown={(e) => { if (savingRef.current) e.preventDefault(); }}
        onInteractOutside={(e) => { if (savingRef.current) e.preventDefault(); }}>
        <DialogHeader><DialogTitle>Cadastro rápido de condição de pagamento</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Forma</Label>
            <ToggleGroup type="single" variant="outline" value={forma} disabled={salvar.isPending} className="justify-start"
              onValueChange={(v) => { if (v === "boleto" || v === "cartao") setForma(v); }} aria-label="Forma de pagamento">
              <ToggleGroupItem value="boleto">Boleto</ToggleGroupItem>
              <ToggleGroupItem value="cartao">Cartão</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="space-y-1">
            <Label htmlFor="condicao-rapida-prazos">Prazos</Label>
            <Input id="condicao-rapida-prazos" autoFocus value={prazos} disabled={salvar.isPending}
              placeholder="ex.: 60/90 ou 0/30/60" onChange={(e) => setPrazos(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleSalvar(); } }} />
            <p className="text-xs text-muted-foreground">Comece com 0 para ter entrada.</p>
          </div>
          <Collapsible open={personalizar} onOpenChange={setPersonalizar}>
            <CollapsibleTrigger asChild><Button variant="ghost" size="sm" disabled={salvar.isPending} className="gap-2 px-0">
              <ChevronDown className={`h-4 w-4 ${personalizar ? "rotate-180" : ""}`} />Personalizar rótulo
            </Button></CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 pt-2">
              <Label htmlFor="condicao-rapida-rotulo">Rótulo (opcional)</Label>
              <Input id="condicao-rapida-rotulo" value={rotulo} onChange={(e) => setRotulo(e.target.value)} disabled={salvar.isPending} />
            </CollapsibleContent>
          </Collapsible>
          <div aria-live="polite">
            {dias === null ? <p role="alert" className="text-sm text-destructive">Informe prazos inteiros separados por /, vírgula, espaço ou hífen.</p>
              : dias.length === 0 ? null
              : !atualizada || previa.isFetching ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Preparando prévia…</div>
              : previa.isError ? <p role="alert" className="text-sm text-destructive">{formatError(previa.error)}</p>
              : previa.data ? <div className="space-y-3 rounded-md border bg-card p-4">
                <p className="break-words font-semibold">{previa.data.rotulo}</p>
                <div className="space-y-1 break-all font-mono text-xs text-muted-foreground"><p>{previa.data.slug}</p><p>{previa.data.canonica}</p></div>
                <Badge variant="outline" className="max-w-full whitespace-normal break-all">{previa.data.regra_codigo}</Badge>
                <ul className="space-y-1 text-sm">
                  {previa.data.entrada && <li>Entrada · à vista</li>}
                  {previa.data.parcelas.map((p) => <li key={p.numero}>Parcela {p.numero} · {p.dias} dias</li>)}
                </ul>
                {previa.data.situacao === "ja_existe_ativa" && <p role="alert" className="rounded-md border border-warning/30 bg-warning/10 p-2 text-sm text-warning-strong">Já cadastrada: {previa.data.rotulo}</p>}
                {previa.data.situacao === "ja_existe_inativa" && <p role="status" className="rounded-md border border-info/30 bg-info/10 p-2 text-sm text-info-strong">Existe inativa — salvar vai reativar</p>}
              </div> : null}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={salvar.isPending} onClick={onClose}>Cancelar</Button>
          <Button disabled={!habilitado} onClick={() => void handleSalvar()} className="gap-2">
            {salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}