import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useInvalidarRecebivel } from "@/hooks/recebivel/useInvalidarRecebivel";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { hojeISO } from "@/lib/data";
import type { TituloCobranca } from "@/hooks/credito/useTitulosCobranca";
import {
  ajusteDoAcordo, dividirSaldo, somarDiasISO, type ParcelaAcordo,
} from "@/lib/financeiro/acordo-parcelas";

/** Título que pode entrar num acordo (a RPC confirma o resto). */
export function tituloElegivelAcordo(t: TituloCobranca): boolean {
  return t.eixo_recebimento === "em_aberto"
    && t.eixo_status !== "cancelado"
    && t.eixo_status !== "devolvido"
    && t.tipo_pagamento !== "conta_corrente";
}

function boletoVivo(t: TituloCobranca) {
  return t.tipo_pagamento === "boleto"
    && (t.boleto_status === "registrado" || t.boleto_status === "vencido");
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCriado?: () => void;
  /** Títulos disponíveis para marcar (todos do mesmo cliente). */
  titulos: TituloCobranca[];
  /** Ids que nascem marcados. */
  selecionadosIniciais: string[];
  /** Saldo em aberto por título (vw_titulo_saldo). */
  saldoDe: (t: TituloCobranca) => number;
}

interface ResultadoAcordo {
  ok: boolean;
  erro?: string;
  numero_acordo?: string;
  filhos?: unknown[];
}

export function CriarAcordoDialog({
  open, onClose, onCriado, titulos, selecionadosIniciais, saldoDe,
}: Props) {
  const invalidarRecebivel = useInvalidarRecebivel();
  const amanha = somarDiasISO(hojeISO(), 1);

  const [marcados, setMarcados] = useState<Set<string>>(new Set(selecionadosIniciais));
  const [tipo, setTipo] = useState<"boleto" | "pix">("boleto");
  const [nDiv, setNDiv] = useState("3");
  const [dataDiv, setDataDiv] = useState(somarDiasISO(hojeISO(), 30));
  const [intervalo, setIntervalo] = useState("30");
  const [parcelas, setParcelas] = useState<ParcelaAcordo[]>([]);
  const [contaAjuste, setContaAjuste] = useState<string | null>(null);
  const [justificativa, setJustificativa] = useState("");
  const [contaAberta, setContaAberta] = useState(false);

  useEffect(() => {
    if (open) setMarcados(new Set(selecionadosIniciais));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selecionados = titulos.filter((t) => marcados.has(t.id));
  const saldo = Math.round(selecionados.reduce((s, t) => s + saldoDe(t), 0) * 100) / 100;
  const soma = Math.round(parcelas.reduce((s, p) => s + (Number(p.valor) || 0), 0) * 100) / 100;
  const ajuste = ajusteDoAcordo(saldo, soma);
  const B = selecionados.filter(boletoVivo).length;
  const M = tipo === "boleto" ? parcelas.length : 0;
  const cliente = titulos[0]?.parceiro_razao_social ?? "—";

  const { data: contasFolha = [] } = useQuery({
    queryKey: ["plano-contas-folhas-ajuste-acordo"],
    enabled: open && ajuste.valor !== 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plano_contas")
        .select("id, codigo, nome, parent_id, ativo")
        .order("codigo");
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      const pais = new Set(rows.map((r) => r.parent_id).filter(Boolean));
      return rows.filter((r) => r.ativo && !pais.has(r.id));
    },
  });
  const contaSel = contasFolha.find((c) => c.id === contaAjuste);

  const parcelasValidas = parcelas.length > 0
    && parcelas.every((p) => Number(p.valor) > 0 && !!p.data_vencimento && p.data_vencimento > hojeISO());
  const podeConfirmar = selecionados.length > 0
    && parcelasValidas
    && justificativa.trim().length >= 10
    && (ajuste.valor === 0 || !!contaAjuste);

  const mutation = useMutation({
    mutationFn: async (): Promise<ResultadoAcordo> => {
      const { data, error } = await (supabase as any).rpc("renegociar_acordo", {
        p_titulo_ids: selecionados.map((t) => t.id),
        p_parcelas: parcelas.map((p) => ({
          valor: Number(Number(p.valor).toFixed(2)),
          data_vencimento: p.data_vencimento,
        })),
        p_justificativa: justificativa.trim(),
        p_tipo_pagamento: tipo,
        p_plano_contas_ajuste_id: ajuste.valor !== 0 ? contaAjuste : null,
      });
      if (error) throw new Error(error.message);
      const res = data as ResultadoAcordo;
      if (!res || res.ok === false) throw new Error(res?.erro ?? "Acordo não criado (resposta vazia).");
      return res;
    },
    onSuccess: async (res) => {
      await invalidarRecebivel();
      const m = res.filhos?.length ?? parcelas.length;
      toast.success(`Acordo ${res.numero_acordo} criado — ${m} parcela${m !== 1 ? "s" : ""}`);
      onCriado?.();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const atualizar = (i: number, patch: Partial<ParcelaAcordo>) =>
    setParcelas((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !mutation.isPending && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar acordo — {cliente}</DialogTitle>
          <DialogDescription>
            {selecionados.length} título{selecionados.length !== 1 ? "s" : ""} · saldo em aberto {formatBRL(saldo)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Títulos do acordo</Label>
            <div className="rounded-md border divide-y max-h-48 overflow-y-auto">
              {titulos.map((t) => (
                <label key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={marcados.has(t.id)}
                    onCheckedChange={(v) =>
                      setMarcados((s) => {
                        const n = new Set(s);
                        if (v) n.add(t.id); else n.delete(t.id);
                        return n;
                      })
                    }
                  />
                  <span className="font-mono text-xs w-28">{t.numero_titulo}</span>
                  <span className="font-mono text-xs text-muted-foreground w-24">{t.pedido_id_externo ?? "—"}</span>
                  <span className="text-xs w-24">{formatDateBR(t.data_vencimento_atual)}</span>
                  <span className="ml-auto font-medium">{formatBRL(saldoDe(t))}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Pagamento das novas parcelas</Label>
            <div className="flex gap-2">
              {(["boleto", "pix"] as const).map((v) => (
                <Button key={v} size="sm" type="button"
                  variant={tipo === v ? "default" : "outline"} onClick={() => setTipo(v)}>
                  {v === "boleto" ? "Boleto" : "PIX"}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Dividir em</span>
              <Input type="number" min="1" className="w-16 h-8" value={nDiv} onChange={(e) => setNDiv(e.target.value)} />
              <span>parcelas a partir de</span>
              <Input type="date" min={amanha} className="w-40 h-8" value={dataDiv} onChange={(e) => setDataDiv(e.target.value)} />
              <span>, a cada</span>
              <Input type="number" min="1" className="w-16 h-8" value={intervalo} onChange={(e) => setIntervalo(e.target.value)} />
              <span>dias</span>
              <Button size="sm" variant="outline" type="button"
                disabled={!(saldo > 0) || !(Number(nDiv) >= 1) || !dataDiv}
                onClick={() => setParcelas(dividirSaldo(saldo, Math.floor(Number(nDiv)), dataDiv, Number(intervalo) || 30))}>
                Dividir
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs">Parcelas</Label>
              <Button size="sm" variant="outline" type="button"
                onClick={() => setParcelas((ps) => [...ps, {
                  valor: "",
                  data_vencimento: ps.length ? somarDiasISO(ps[ps.length - 1].data_vencimento, Number(intervalo) || 30) : amanha,
                }])}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar
              </Button>
            </div>
            {parcelas.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-6">{i + 1}.</span>
                <Input type="number" step="0.01" min="0" placeholder="Valor" className="w-32"
                  value={p.valor} onChange={(e) => atualizar(i, { valor: e.target.value })} />
                <Input type="date" min={amanha} className="w-44"
                  value={p.data_vencimento} onChange={(e) => atualizar(i, { data_vencimento: e.target.value })} />
                <Button size="icon" variant="ghost" type="button"
                  onClick={() => setParcelas((ps) => ps.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Saldo em aberto <b>{formatBRL(saldo)}</b> · Soma das parcelas <b>{formatBRL(soma)}</b> ·{" "}
              {ajuste.rotulo}{ajuste.valor !== 0 && <> <b>{formatBRL(Math.abs(ajuste.valor))}</b></>}
            </p>
          </div>

          {ajuste.valor !== 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">
                Conta contábil do ajuste <span className="text-destructive">*</span>
              </Label>
              <Popover open={contaAberta} onOpenChange={setContaAberta}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox"
                    className={cn("w-full justify-between font-normal", !contaSel && "text-muted-foreground")}>
                    <span className="truncate">
                      {contaSel ? `${contaSel.codigo} — ${contaSel.nome}` : "Selecione a conta..."}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar conta..." />
                    <CommandList className="max-h-72">
                      <CommandEmpty>Nenhuma conta encontrada.</CommandEmpty>
                      {contasFolha.map((c) => (
                        <CommandItem key={c.id} value={`${c.codigo} ${c.nome}`}
                          onSelect={() => { setContaAjuste(c.id); setContaAberta(false); }}>
                          <Check className={cn("mr-2 h-4 w-4", contaAjuste === c.id ? "opacity-100" : "opacity-0")} />
                          <span className="text-sm">{c.codigo} — {c.nome}</span>
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">
              Justificativa <span className="text-destructive">*</span>
            </Label>
            <Textarea rows={3} value={justificativa} onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Motivo do acordo (mín. 10 caracteres)." />
            <p className="text-[11px] text-muted-foreground">{justificativa.trim().length}/10</p>
          </div>

          <Alert className="border-warning/40 bg-warning/10">
            <AlertDescription className="text-xs">
              Os {selecionados.length} títulos de origem serão encerrados como recuperação e não poderão mais receber pagamento.
              {B > 0 && (
                <> {B} boleto{B !== 1 ? "s" : ""} antigo{B !== 1 ? "s" : ""} continua{B !== 1 ? "m" : ""} vivo{B !== 1 ? "s" : ""} no Safra até a baixa
                  (remessa de baixa na aba Banco → SafraNet → retorno com ocorrência 10). Até lá o cliente tem {B + M} boletos
                  para a mesma dívida — envie só os novos.</>
              )}
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={!podeConfirmar || mutation.isPending}>
            {mutation.isPending ? "Criando acordo..." : "Confirmar acordo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
