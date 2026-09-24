import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ClipboardCheck, ArchiveRestore, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { formatError } from "@/lib/format-error";
import type { PedidoB2cRow } from "@/hooks/vendas/useB2c";

const ESTAGIOS_SEM_RESOLVER = ["entregue", "cancelado", "encerrado"];
const MIN_MOTIVO = 5;

type Saida = "entregue" | "encerrar";
type Modo = "resolver" | "reabrir" | "desfazer_entrega";

function hojeISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Resolver / reabrir / desfazer entrega declarada de um caso B2C. As RPCs decidem e
 * recusam com mensagem em português; a tela só mostra o que o banco devolveu.
 */
export function EncerrarCasoB2c({
  pedido,
  variante = "icone",
  onFeito,
}: {
  pedido: PedidoB2cRow;
  variante?: "icone" | "botao";
  onFeito?: () => void;
}) {
  const qc = useQueryClient();
  const permEncerrar = usePermissaoAcaoOuSuperAdmin("acao.encerrar_pedido_b2c");
  const permEntrega = usePermissaoAcaoOuSuperAdmin("acao.declarar_entrega_b2c");
  const [aberto, setAberto] = useState(false);
  const [saida, setSaida] = useState<Saida | null>(null);
  const [motivo, setMotivo] = useState("");
  const [data, setData] = useState(hojeISO());
  const [dataTocada, setDataTocada] = useState(false);
  const [gravando, setGravando] = useState(false);

  const estagio = pedido.estagio ?? "";
  let modo: Modo | null = null;
  if (estagio === "encerrado") modo = "reabrir";
  else if (estagio === "entregue" && pedido.entrega_fonte === "declarado") modo = "desfazer_entrega";
  else if (!ESTAGIOS_SEM_RESOLVER.includes(estagio)) modo = "resolver";
  if (!pedido.order_name || !modo) return null;

  const carregando = permEncerrar.carregando || permEntrega.carregando;
  const podeEncerrar = permEncerrar.permitido;
  const podeEntrega = permEntrega.permitido;
  const permitido =
    modo === "reabrir" ? podeEncerrar : modo === "desfazer_entrega" ? podeEntrega : podeEncerrar || podeEntrega;

  const rotulo = modo === "reabrir" ? "Reabrir caso" : modo === "desfazer_entrega" ? "Desfazer entrega declarada" : "Resolver caso";
  const Icone = modo === "reabrir" ? ArchiveRestore : modo === "desfazer_entrega" ? Undo2 : ClipboardCheck;
  const dica = carregando ? "Verificando permissão…" : permitido ? rotulo : `Sem permissão para ${rotulo.toLowerCase()}`;
  const motivoOk = motivo.trim().length >= MIN_MOTIVO;
  // Só uma opção permitida → já vem escolhida.
  const saidaEfetiva: Saida | null =
    modo !== "resolver" ? null : podeEntrega && podeEncerrar ? saida : podeEntrega ? "entregue" : "encerrar";
  const prontoConfirmar = motivoOk && (modo !== "resolver" || saidaEfetiva !== null);

  function limpar() {
    setMotivo(""); setSaida(null); setData(hojeISO()); setDataTocada(false);
  }

  async function confirmar() {
    if (!prontoConfirmar || gravando) return;
    setGravando(true);
    try {
      let fn: string;
      const args: Record<string, unknown> = { p_order_name: pedido.order_name, p_motivo: motivo.trim() };
      if (modo === "reabrir") fn = "fn_b2c_reabrir_pedido";
      else if (modo === "desfazer_entrega") fn = "fn_b2c_desfazer_entrega_declarada";
      else if (saidaEfetiva === "entregue") {
        fn = "fn_b2c_declarar_entrega";
        if (dataTocada && data) args.p_data = new Date(`${data}T12:00:00`).toISOString();
      } else fn = "fn_b2c_encerrar_pedido";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: res, error } = await (supabase as any).rpc(fn, args);
      if (error) throw error;
      if (res && typeof res === "object" && "ok" in res && res.ok !== true)
        throw new Error(res.erro ?? res.mensagem ?? "O banco não confirmou a operação.");
      await qc.invalidateQueries({ queryKey: ["b2c-pedidos"] });
      await qc.invalidateQueries({ queryKey: ["b2c-pipeline"] });
      const msg =
        modo === "reabrir" ? "reaberto" : modo === "desfazer_entrega" ? "voltou para Em transporte"
        : saidaEfetiva === "entregue" ? "marcado como entregue" : "encerrado sem entrega";
      toast.success(`Caso ${pedido.order_name} ${msg}.`);
      setAberto(false);
      limpar();
      onFeito?.();
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setGravando(false);
    }
  }

  const gatilho =
    variante === "icone" ? (
      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={carregando || !permitido}
        aria-label={`${rotulo} ${pedido.order_name}`} onClick={() => setAberto(true)}>
        <Icone className="h-3.5 w-3.5" />
      </Button>
    ) : (
      <Button size="sm" variant="outline" disabled={carregando || !permitido} onClick={() => setAberto(true)}>
        <Icone className="mr-2 h-3.5 w-3.5" />
        {rotulo}
      </Button>
    );

  const idBase = `caso-${pedido.order_name}`;
  const opcoes: { v: Saida; titulo: string; apoio: string }[] = [];
  if (podeEntrega) opcoes.push({ v: "entregue", titulo: "Foi entregue", apoio: "O cliente recebeu, mas o rastreio não prova (entrega em mãos, retirada, envio fora dos Correios)." });
  if (podeEncerrar) opcoes.push({ v: "encerrar", titulo: "Não foi entregue e não vai ser", apoio: "Extravio, desistência, baixa administrativa. O caso sai da carteira sem confirmação de entrega." });

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild><span className="inline-flex">{gatilho}</span></TooltipTrigger>
        <TooltipContent>{dica}</TooltipContent>
      </Tooltip>
      <Dialog open={aberto} onOpenChange={(v) => { if (gravando) return; setAberto(v); if (!v) limpar(); }}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{rotulo} {pedido.order_name}</DialogTitle>
            <DialogDescription>
              {modo === "reabrir"
                ? "O pedido volta para a carteira ativa e retoma o acompanhamento normal."
                : modo === "desfazer_entrega"
                  ? "A entrega declarada à mão é desfeita e o pedido volta para Em transporte."
                  : "O que aconteceu com este pedido?"}
            </DialogDescription>
          </DialogHeader>

          {modo === "resolver" && (
            <RadioGroup value={saidaEfetiva ?? ""} onValueChange={(v) => setSaida(v as Saida)} className="gap-2" disabled={gravando}>
              {opcoes.map((o) => (
                <Label key={o.v} htmlFor={`${idBase}-${o.v}`}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal ${saidaEfetiva === o.v ? "border-primary bg-primary/5" : "border-border"}`}>
                  <RadioGroupItem id={`${idBase}-${o.v}`} value={o.v} className="mt-0.5" />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">{o.titulo}</span>
                    <span className="block text-xs text-muted-foreground">{o.apoio}</span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          )}

          {modo === "resolver" && saidaEfetiva === "entregue" && (
            <div className="space-y-1.5">
              <Label htmlFor={`${idBase}-data`}>Data da entrega (opcional)</Label>
              <Input id={`${idBase}-data`} type="date" value={data} max={hojeISO()} disabled={gravando}
                onChange={(e) => { setData(e.target.value); setDataTocada(true); }} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor={`${idBase}-motivo`}>Motivo (obrigatório, mínimo {MIN_MOTIVO} caracteres)</Label>
            <Textarea id={`${idBase}-motivo`} rows={3} value={motivo}
              onChange={(e) => setMotivo(e.target.value)} disabled={gravando} />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={gravando} onClick={() => { setAberto(false); limpar(); }}>Cancelar</Button>
            <Button variant={modo === "resolver" && saidaEfetiva === "encerrar" ? "destructive" : "default"}
              disabled={!prontoConfirmar || gravando} onClick={() => void confirmar()}>
              {gravando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {modo === "resolver" ? "Confirmar" : rotulo}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
