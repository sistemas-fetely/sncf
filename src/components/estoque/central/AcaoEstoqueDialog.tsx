/**
 * Ações de 1 produto × 1 CD da Central de Estoque. Cada modo chama a RPC que já
 * existe (a permissão é a do banco). FAIL-LOUD: erro nunca fecha o diálogo.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatError } from "@/lib/format-error";
import { invalidarEstoque } from "@/hooks/estoque/useCentralEstoque";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type ModoAcao = "contar" | "reclassificar" | "movimento" | "transferencia";
const TITULO: Record<ModoAcao, string> = {
  contar: "Contar", reclassificar: "Reclassificar condição", movimento: "Movimento manual", transferencia: "Transferência interna",
};

const hoje = () => new Date().toISOString().slice(0, 10);

export function AcaoEstoqueDialog({ modo, sku, rotuloProduto, centro, centroRotulo, destinos, onFechar }: {
  modo: ModoAcao | null; sku: string; rotuloProduto: string; centro: string; centroRotulo: string;
  destinos: { codigo: string; rotulo: string }[]; onFechar: () => void;
}) {
  const qc = useQueryClient();
  const [qtd, setQtd] = useState("");
  const [data, setData] = useState(hoje());
  const [de, setDe] = useState("sadio");
  const [para, setPara] = useState("");
  const [motivo, setMotivo] = useState("");
  const [condicao, setCondicao] = useState("sadio");
  const [doc, setDoc] = useState("");
  const [obs, setObs] = useState("");
  const [destino, setDestino] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (modo) { setQtd(""); setData(hoje()); setDe("sadio"); setPara(""); setMotivo(""); setCondicao("sadio"); setDoc(""); setObs(""); setErro(null); setDestino(destinos[0]?.codigo ?? ""); }
  }, [modo]); // eslint-disable-line react-hooks/exhaustive-deps

  const condicoes = useQuery({
    queryKey: ["estoque-condicao-ativas"], enabled: modo === "reclassificar" || modo === "movimento",
    queryFn: async () => {
      const { data, error } = await sb.from("estoque_condicao").select("codigo, rotulo").eq("ativo", true).order("ordem");
      if (error) throw error; return (data ?? []) as { codigo: string; rotulo: string }[];
    },
  });
  const motivos = useQuery({
    queryKey: ["estoque-motivo-manual"], enabled: modo === "movimento",
    queryFn: async () => {
      const { data, error } = await sb.from("estoque_motivo_movimento").select("codigo, rotulo, exige_documento, exige_aprovacao")
        .eq("ativo", true).eq("automatico", false).order("ordem");
      if (error) throw error; return (data ?? []) as { codigo: string; rotulo: string; exige_documento: boolean; exige_aprovacao: boolean }[];
    },
  });
  const motivoSel = motivos.data?.find((m) => m.codigo === motivo);

  const q = Number(qtd.replace(",", "."));
  const qtdOk = qtd !== "" && Number.isFinite(q) && (modo === "contar" ? q >= 0 : modo === "movimento" ? q !== 0 : q > 0);
  const pronto = qtdOk && (
    modo === "contar" ? !!data
    : modo === "reclassificar" ? !!de && !!para && de !== para
    : modo === "movimento" ? !!motivo && !!condicao && (!motivoSel?.exige_documento || doc.trim().length > 0)
    : !!destino);

  const exec = useMutation({
    mutationFn: async () => {
      let r: { data: unknown; error: unknown };
      if (modo === "contar") r = await sb.rpc("fn_registrar_contagem", { p_centro_codigo: centro, p_data: data, p_itens: [{ sku, qtd: q, condicao: "sadio" }], p_referencia: doc.trim() || null });
      else if (modo === "reclassificar") r = await sb.rpc("reclassificar_condicao_estoque", { p_sku: sku, p_centro: centro, p_de: de, p_para: para, p_quantidade: q, p_doc_numero: doc.trim() || null, p_obs: obs.trim() || null });
      else if (modo === "movimento") r = await sb.rpc("registrar_movimento_estoque", { p_sku: sku, p_centro: centro, p_condicao: condicao, p_quantidade: q, p_motivo: motivo, p_doc_tipo: doc.trim() ? "manual" : null, p_doc_numero: doc.trim() || null, p_obs: obs.trim() || null });
      else r = await sb.rpc("fn_transferencia_interna", { p_origem: centro, p_destino: destino, p_itens: [{ sku, quantidade: q }], p_observacao: obs.trim() || null });
      if (r.error) throw r.error;
      const res = (r.data ?? {}) as { ok?: boolean; erro?: string; mensagem?: string };
      if (res && typeof res === "object" && res.ok === false) throw new Error(res.erro ?? res.mensagem ?? "O banco recusou a operação.");
      return res;
    },
    onSuccess: async () => { toast.success(`${TITULO[modo!]} registrado.`); await invalidarEstoque(qc); onFechar(); },
    onError: (e) => { const m = formatError(e); setErro(m); toast.error(m); },
  });

  const lista = (itens: { codigo: string; rotulo: string }[] | undefined, v: string, set: (s: string) => void, ph: string) => (
    <Select value={v} onValueChange={set}>
      <SelectTrigger><SelectValue placeholder={ph} /></SelectTrigger>
      <SelectContent>{(itens ?? []).map((i) => <SelectItem key={i.codigo} value={i.codigo}>{i.rotulo}</SelectItem>)}</SelectContent>
    </Select>
  );

  return (
    <Dialog open={!!modo} onOpenChange={(o) => !o && !exec.isPending && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{modo ? TITULO[modo] : ""}</DialogTitle>
          <DialogDescription>{rotuloProduto} · {centroRotulo}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {modo === "transferencia" && (
            <div className="space-y-1"><Label>Destino</Label>{lista(destinos, destino, setDestino, "Destino")}</div>
          )}
          {modo === "reclassificar" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label>De</Label>{lista(condicoes.data, de, setDe, "De")}</div>
              <div className="space-y-1"><Label>Para</Label>{lista(condicoes.data, para, setPara, "Para")}</div>
            </div>
          )}
          {modo === "movimento" && (
            <>
              <div className="space-y-1"><Label>Motivo</Label>{lista(motivos.data, motivo, setMotivo, "Motivo")}</div>
              <div className="space-y-1"><Label>Condição</Label>{lista(condicoes.data, condicao, setCondicao, "Condição")}</div>
              {motivoSel?.exige_aprovacao && (
                <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription className="text-xs">Este motivo exige aprovação.</AlertDescription></Alert>
              )}
            </>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>{modo === "contar" ? "Quantidade contada" : modo === "movimento" ? "Quantidade (±)" : "Quantidade"}</Label>
              <Input inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} className="tabular-nums" />
            </div>
            {modo === "contar" && <div className="space-y-1"><Label>Data</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>}
          </div>
          {modo !== "transferencia" && (
            <div className="space-y-1">
              <Label>Documento{modo === "movimento" && motivoSel?.exige_documento ? " *" : ""}</Label>
              <Input value={doc} onChange={(e) => setDoc(e.target.value)} />
            </div>
          )}
          {modo !== "contar" && <div className="space-y-1"><Label>Observação</Label><Input value={obs} onChange={(e) => setObs(e.target.value)} /></div>}
          {(erro || condicoes.error || motivos.error) && (
            <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription className="text-xs">{erro ?? formatError(condicoes.error ?? motivos.error)}</AlertDescription></Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={exec.isPending}>Cancelar</Button>
          <Button onClick={() => { setErro(null); exec.mutate(); }} disabled={!pronto || exec.isPending}>
            {exec.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
