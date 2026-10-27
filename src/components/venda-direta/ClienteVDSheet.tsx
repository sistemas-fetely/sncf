import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { fetchCep } from "@/lib/viacep";
import { reprocessarFilaB2c } from "@/hooks/vendas/useB2c";
import { invalidarVendaDireta } from "@/components/venda-direta/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

interface Ficha {
  id: string; nome: string | null; cpf_mascarado: string | null; telefone: string | null; email: string | null;
  cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null;
  bairro: string | null; cidade: string | null; uf: string | null;
}
type Dados = { nome: string; telefone: string; email: string; cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string };
const VAZIO: Dados = { nome: "", telefone: "", email: "", cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "" };

const mascaraCep = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

export function ClienteVDSheet({ parceiroId, pedidoId, filaId, filaErro, open, onOpenChange }: {
  parceiroId: string; pedidoId?: string; filaId?: string; filaErro?: string | null; open: boolean; onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["vd-cliente-ficha", parceiroId],
    enabled: open && !!parceiroId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("vd_cliente_ficha" as never, { p_parceiro_id: parceiroId } as never);
      if (error) throw error;
      return data as unknown as Ficha;
    },
  });
  const [d, setD] = useState<Dados>(VAZIO);
  const [buscandoCep, setBuscandoCep] = useState(false);
  useEffect(() => {
    const f = q.data;
    if (!f) return;
    setD({ nome: f.nome ?? "", telefone: f.telefone ?? "", email: f.email ?? "", cep: mascaraCep(f.cep ?? ""), logradouro: f.logradouro ?? "", numero: f.numero ?? "", complemento: f.complemento ?? "", bairro: f.bairro ?? "", cidade: f.cidade ?? "", uf: f.uf ?? "" });
  }, [q.data]);
  useEffect(() => { if (q.error) toast.error(rawMessage(q.error)); }, [q.error]);

  const set = (k: keyof Dados) => (v: string) => setD((a) => ({ ...a, [k]: v }));
  const mudarCep = async (v: string) => {
    const m = mascaraCep(v);
    setD((a) => ({ ...a, cep: m }));
    if (m.replace(/\D/g, "").length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await fetchCep(m);
      if (!r) { toast.error("CEP não encontrado."); return; }
      setD((a) => ({ ...a, logradouro: r.logradouro || a.logradouro, bairro: r.bairro || a.bairro, cidade: r.localidade || a.cidade, uf: r.uf || a.uf }));
    } finally { setBuscandoCep(false); }
  };

  const salvar = useMutation({
    mutationFn: async (reprocessar: boolean) => {
      const { data, error } = await supabase.rpc("vd_atualizar_cliente" as never, { p_parceiro_id: parceiroId, p_dados: d, p_pedido_id: pedidoId ?? null } as never);
      if (error) throw error;
      const r = data as { ok?: boolean; erro?: string; mudou?: boolean } | null;
      if (r?.ok === false) throw new Error(r.erro ?? "O banco recusou a alteração.");
      if (reprocessar && filaId) await reprocessarFilaB2c([filaId], "bling", "Cliente corrigido na gestão VD");
      return { reprocessar, mudou: r?.mudou };
    },
    onSuccess: async ({ reprocessar, mudou }) => {
      toast.success(reprocessar ? "Cliente salvo e pedido reenviado ao Bling" : mudou === false ? "Nada mudou no cadastro" : "Cliente salvo");
      await Promise.all([qc.invalidateQueries({ queryKey: ["vd-cliente-ficha", parceiroId] }), invalidarVendaDireta(qc)]);
      onOpenChange(false);
    },
    onError: (e) => toast.error(rawMessage(e)),
  });

  const campo = (k: keyof Dados, rotulo: string, extra?: { placeholder?: string; type?: string }) => (
    <div className="space-y-1"><Label>{rotulo}</Label><Input value={d[k]} type={extra?.type} placeholder={extra?.placeholder} onChange={(e) => set(k)(e.target.value)} /></div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 bg-card p-0 text-card-foreground sm:max-w-[480px]">
        <SheetHeader className="border-b p-4">
          <SheetTitle>Editar cliente</SheetTitle>
          <SheetDescription>{q.data?.nome ?? "Cadastro do cliente"}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {filaErro && <div className="whitespace-pre-wrap rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{filaErro}</div>}
          {q.isLoading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
            : q.isError ? <div className="text-sm text-destructive">{rawMessage(q.error)}</div>
            : <>
              {campo("nome", "Nome")}
              <div className="space-y-1"><Label>CPF</Label><Input value={q.data?.cpf_mascarado ?? "—"} readOnly disabled /><p className="text-xs text-muted-foreground">CPF não se altera aqui.</p></div>
              {campo("telefone", "Telefone")}
              {campo("email", "E-mail", { type: "email" })}
              <div className="space-y-3 rounded-md border bg-background p-3">
                <div className="text-sm font-medium">Endereço</div>
                <div className="space-y-1"><Label>CEP</Label><div className="relative"><Input value={d.cep} placeholder="00000-000" inputMode="numeric" onChange={(e) => void mudarCep(e.target.value)} />{buscandoCep && <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}</div></div>
                {campo("logradouro", "Logradouro")}
                <div className="grid grid-cols-2 gap-3">{campo("numero", "Número")}{campo("complemento", "Complemento")}</div>
                {campo("bairro", "Bairro")}
                <div className="grid grid-cols-[1fr_96px] gap-3">
                  {campo("cidade", "Cidade")}
                  <div className="space-y-1"><Label>UF</Label><Select value={d.uf} onValueChange={set("uf")}><SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger><SelectContent>{UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div>
                </div>
              </div>
            </>}
        </div>
        <SheetFooter className="gap-2 border-t p-4">
          <Button variant="outline" disabled={!q.isSuccess || salvar.isPending} onClick={() => salvar.mutate(false)}>{salvar.isPending && salvar.variables === false && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar</Button>
          {filaId && <Button disabled={!q.isSuccess || salvar.isPending} onClick={() => salvar.mutate(true)}>{salvar.isPending && salvar.variables === true && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar e reprocessar</Button>}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
