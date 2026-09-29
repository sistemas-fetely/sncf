/**
 * Cadastro/edição do contrato de consignado (3 modelos: venda_com_acerto,
 * consignacao_fiscal, venda_fora). Grava via RPC `fn_consignado_contrato_salvar`,
 * que também liga o centro ao parceiro e marca o parceiro em regime consignado.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { formatError } from "@/lib/format-error";
import { formatCNPJ } from "@/lib/cnpj";
import { hojeISO } from "@/lib/data";
import { cn } from "@/lib/utils";

type Parceiro = { id: string; razao_social: string; nome_fantasia: string | null; cnpj: string | null };

interface Props {
  aberto: boolean;
  onFechar: () => void;
  parceiroId?: string;
  onSalvo: () => void;
}

export function ContratoConsignadoDialog({ aberto, onFechar, parceiroId, onSalvo }: Props) {
  const sb = supabase as any;
  const [parceiro, setParceiro] = useState<Parceiro | null>(null);
  const [busca, setBusca] = useState("");
  const [modelo, setModelo] = useState("");
  const [centro, setCentro] = useState("");
  const [inicio, setInicio] = useState(hojeISO());
  const [meses, setMeses] = useState("12");
  const [renova, setRenova] = useState(true);
  const [pct, setPct] = useState("");
  const [dia, setDia] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  const modelosQ = useQuery({
    queryKey: ["consignado-modelo-dim"],
    enabled: aberto,
    queryFn: async () => {
      const { data, error } = await sb.from("consignado_modelo_dim").select("codigo, nome, descricao, ordem").eq("ativo", true).order("ordem");
      if (error) throw error;
      return (data ?? []) as { codigo: string; nome: string; descricao: string | null }[];
    },
  });

  const centrosQ = useQuery({
    queryKey: ["consignado-centros-parceiro"],
    enabled: aberto,
    queryFn: async () => {
      const { data, error } = await sb.from("centro_distribuicao").select("id, codigo, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return ((data ?? []) as { id: string; codigo: string; nome: string }[]).filter(c => c.codigo !== "XPM-SC" && c.codigo !== "SITE-SP");
    },
  });

  const parceiroFixoQ = useQuery({
    queryKey: ["consignado-contrato-dialog", parceiroId],
    enabled: aberto && !!parceiroId,
    queryFn: async () => {
      const { data: p, error: e1 } = await sb.from("parceiros_comerciais").select("id, razao_social, nome_fantasia, cnpj").eq("id", parceiroId).maybeSingle();
      if (e1) throw e1;
      const { data: c, error: e2 } = await sb.from("consignado_contrato").select("*").eq("parceiro_id", parceiroId).eq("ativo", true).maybeSingle();
      if (e2) throw e2;
      let centroCodigo: string | null = null;
      if (c?.centro_id) {
        const { data: cd, error: e3 } = await sb.from("centro_distribuicao").select("codigo").eq("id", c.centro_id).maybeSingle();
        if (e3) throw e3;
        centroCodigo = cd?.codigo ?? null;
      }
      return { parceiro: p as Parceiro | null, contrato: c as any, centroCodigo };
    },
  });

  const buscaQ = useQuery({
    queryKey: ["consignado-busca-parceiro", busca],
    enabled: aberto && !parceiroId && busca.trim().length >= 2,
    queryFn: async () => {
      const t = busca.trim().replace(/[%,()]/g, " ");
      const dig = t.replace(/\D/g, "");
      const ors = [`razao_social.ilike.%${t}%`, `nome_fantasia.ilike.%${t}%`];
      if (dig.length >= 3) ors.push(`cnpj.ilike.%${dig}%`);
      const { data, error } = await sb.from("parceiros_comerciais").select("id, razao_social, nome_fantasia, cnpj").or(ors.join(",")).order("razao_social").limit(20);
      if (error) throw error;
      return (data ?? []) as Parceiro[];
    },
  });

  // reinicia ao abrir
  useEffect(() => {
    if (!aberto) return;
    setParceiro(null); setBusca(""); setModelo(""); setCentro(""); setInicio(hojeISO()); setMeses("12");
    setRenova(true); setPct(""); setDia(""); setObs(""); setSalvando(false);
  }, [aberto]);

  // preenche com contrato ativo
  useEffect(() => {
    const d = parceiroFixoQ.data;
    if (!aberto || !d) return;
    setParceiro(d.parceiro);
    const c = d.contrato;
    if (c) {
      setModelo(c.modelo ?? "");
      setCentro(d.centroCodigo ?? "");
      setInicio(c.vigencia_inicio ?? hojeISO());
      setMeses(c.vigencia_meses != null ? String(c.vigencia_meses) : "");
      setRenova(c.renovacao_automatica ?? true);
      setPct(c.pct_retencao != null ? String(c.pct_retencao) : "");
      setDia(c.dia_repasse != null ? String(c.dia_repasse) : "");
      setObs(c.observacao ?? "");
    }
  }, [aberto, parceiroFixoQ.data]);

  async function salvar() {
    const nMeses = Number(meses);
    const nPct = pct.trim() === "" ? null : Number(pct.replace(",", "."));
    const nDia = dia.trim() === "" ? null : Number(dia);
    if (!parceiro) return toast.error("Escolha o parceiro.");
    if (!modelo) return toast.error("Escolha o modelo.");
    if (!centro) return toast.error("Escolha o centro do parceiro.");
    if (!inicio) return toast.error("Informe o início da vigência.");
    if (!Number.isInteger(nMeses) || nMeses <= 0) return toast.error("Duração deve ser um número inteiro de meses maior que zero.");
    if (nPct != null && (isNaN(nPct) || nPct < 0 || nPct > 99.999)) return toast.error("% retido deve estar entre 0 e 99,999.");
    if (nDia != null && (!Number.isInteger(nDia) || nDia < 1 || nDia > 31)) return toast.error("Dia do repasse deve ser entre 1 e 31.");
    setSalvando(true);
    try {
      const { data, error } = await sb.rpc("fn_consignado_contrato_salvar", {
        p_parceiro_id: parceiro.id,
        p_modelo: modelo,
        p_centro_codigo: centro,
        p_vigencia_inicio: inicio,
        p_vigencia_meses: nMeses,
        p_renovacao_automatica: renova,
        p_pct_retencao: nPct,
        p_dia_repasse: nDia,
        p_observacao: obs.trim() || null,
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data?.erro ?? "O banco recusou o contrato.");
      toast.success(`Contrato salvo: ${data?.parceiro ?? parceiro.razao_social} · ${data?.centro ?? centro}`);
      onSalvo();
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setSalvando(false);
    }
  }

  const modeloSel = modelosQ.data?.find(m => m.codigo === modelo);
  const erroCarga = modelosQ.error || centrosQ.error || parceiroFixoQ.error;

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{parceiroId ? "Contrato de consignado" : "Novo contrato de consignado"}</DialogTitle>
          <DialogDescription>Modelo, centro do parceiro, vigência e retenção.</DialogDescription>
        </DialogHeader>
        {erroCarga && <p className="text-sm text-destructive">Falha ao carregar: {formatError(erroCarga)}</p>}
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Parceiro *</Label>
            {parceiro ? (
              <div className="flex items-center justify-between rounded border p-2 text-sm">
                <div><div className="font-medium">{parceiro.razao_social}</div><div className="text-xs text-muted-foreground">{parceiro.cnpj ? formatCNPJ(parceiro.cnpj) : "sem CNPJ"}</div></div>
                {!parceiroId && <Button variant="ghost" size="sm" onClick={() => setParceiro(null)}>Trocar</Button>}
              </div>
            ) : parceiroId ? (
              <p className="text-sm text-muted-foreground">{parceiroFixoQ.isLoading ? "Carregando…" : "Parceiro não encontrado."}</p>
            ) : (
              <>
                <Input placeholder="Razão social, nome fantasia ou CNPJ" value={busca} onChange={e => setBusca(e.target.value)} />
                {buscaQ.error && <p className="text-xs text-destructive">{formatError(buscaQ.error)}</p>}
                {busca.trim().length >= 2 && (
                  <div className="max-h-48 overflow-y-auto rounded border">
                    {buscaQ.isLoading ? <p className="p-2 text-xs text-muted-foreground">Buscando…</p> :
                      (buscaQ.data ?? []).length === 0 ? <p className="p-2 text-xs text-muted-foreground">Nenhum parceiro encontrado.</p> :
                      buscaQ.data!.map(p => (
                        <button key={p.id} type="button" onClick={() => setParceiro(p)} className="block w-full px-2 py-1.5 text-left text-sm hover:bg-muted">
                          <div>{p.razao_social}</div><div className="text-xs text-muted-foreground">{p.cnpj ? formatCNPJ(p.cnpj) : "sem CNPJ"}</div>
                        </button>
                      ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-1">
            <Label>Modelo *</Label>
            <Select value={modelo} onValueChange={setModelo}>
              <SelectTrigger><SelectValue placeholder="Escolha o modelo" /></SelectTrigger>
              <SelectContent>{(modelosQ.data ?? []).map(m => <SelectItem key={m.codigo} value={m.codigo}>{m.nome}</SelectItem>)}</SelectContent>
            </Select>
            {modeloSel?.descricao && <p className="text-xs text-muted-foreground">{modeloSel.descricao}</p>}
          </div>

          <div className="space-y-1">
            <Label>Centro do parceiro *</Label>
            <Select value={centro} onValueChange={setCentro}>
              <SelectTrigger><SelectValue placeholder="Escolha o centro" /></SelectTrigger>
              <SelectContent>{(centrosQ.data ?? []).map(c => <SelectItem key={c.codigo} value={c.codigo}>{c.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Início da vigência *</Label><Input type="date" value={inicio} onChange={e => setInicio(e.target.value)} /></div>
            <div className="space-y-1"><Label>Duração (meses) *</Label><Input type="number" min={1} step={1} value={meses} onChange={e => setMeses(e.target.value)} /></div>
          </div>

          <div className="flex items-center gap-2"><Switch checked={renova} onCheckedChange={setRenova} id="renova" /><Label htmlFor="renova">Renovação automática</Label></div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>% retido pelo parceiro sobre a venda</Label>
              <Input inputMode="decimal" value={pct} onChange={e => setPct(e.target.value)} placeholder="0" />
              <p className="text-xs text-muted-foreground">Tudo o que o parceiro retém na venda: aluguel, comissões e sistema</p>
            </div>
            <div className="space-y-1"><Label>Dia do repasse</Label><Input type="number" min={1} max={31} value={dia} onChange={e => setDia(e.target.value)} /></div>
          </div>

          <div className="space-y-1"><Label>Observação</Label><Textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <BotaoGuardado slug="acao.consignado_contrato_gerir" rotuloAcao="Salvar contrato de consignado" onClick={salvar} disabled={salvando} className={cn()}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar contrato
          </BotaoGuardado>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ContratoConsignadoDialog;
