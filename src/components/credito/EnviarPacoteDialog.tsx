import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEnviarEmailNfBoletos } from "@/hooks/pedidos/useEnviarEmailNfBoletos";
import { useLogEmailEnvio } from "@/hooks/pedidos/usePedidoEmailLog";
import { useEmailCobrancaParceiro } from "@/hooks/credito/useEmailCobrancaParceiro";
import type { LinhaMesa } from "@/lib/financeiro/adaptar-titulo-mesa";

const RE_EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]{2,}$/;

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface Props {
  linha: LinhaMesa | null;
  /** Total das parcelas do pedido; se ausente cai no valor da parcela da linha. */
  valorTotalPedido?: number | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Query keys extras para invalidar após o envio. */
  onEnviado?: () => Promise<void> | void;
}

export function EnviarPacoteDialog({ linha, valorTotalPedido, open, onOpenChange, onEnviado }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const enviarNfBoletos = useEnviarEmailNfBoletos();
  const logEnvio = useLogEmailEnvio();

  const [destinatario, setDestinatario] = useState("");
  const [ccTexto, setCcTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (open) {
      setDestinatario(linha?.email_cliente ?? "");
      setCcTexto("");
    }
  }, [open, linha?.email_cliente]);

  const destinatarioTrim = destinatario.trim();
  const destinatarioValido = RE_EMAIL.test(destinatarioTrim);
  const erroDestinatario =
    destinatarioTrim.length === 0
      ? "Informe o e-mail do destinatário."
      : destinatarioValido
        ? null
        : "E-mail inválido — verifique o endereço.";

  const ccLista = useMemo(
    () => ccTexto.split(",").map((e) => e.trim()).filter(Boolean),
    [ccTexto],
  );
  const ccInvalidos = ccLista.filter((e) => !RE_EMAIL.test(e));
  const erroCc = ccInvalidos.length > 0
    ? `E-mail(s) inválido(s) em cópia: ${ccInvalidos.join(", ")}`
    : null;

  const podeEnviar = !!linha?.pedido_id && destinatarioValido && !erroCc && !enviando;

  const handleEnviar = async () => {
    if (!linha?.pedido_id) {
      toast({ title: "Sem pedido vinculado", description: "Não é possível enviar o pacote.", variant: "destructive" });
      return;
    }
    setEnviando(true);
    try {
      await enviarNfBoletos.mutateAsync({
        pedido_id: linha.pedido_id,
        emails: [destinatarioTrim],
        cc: ccLista.length > 0 ? ccLista : undefined,
        skipEstagioCheck: true,
      });
      await logEnvio.mutateAsync({
        pedido_id: linha.pedido_id,
        tipo_email: "nf_boletos",
        destinatario: destinatarioTrim,
        cc: ccLista.length > 0 ? ccLista : undefined,
        estagio_pedido: linha.estagio ?? undefined,
        titulo_id: linha.titulo_id,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["cobranca-mesa"] }),
        qc.invalidateQueries({ queryKey: ["boletos-safra"] }),
        qc.invalidateQueries({ queryKey: ["titulos-cobranca"] }),
      ]);
      if (onEnviado) await onEnviado();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Falha ao enviar pacote",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  const total = Number(valorTotalPedido ?? linha?.valor_atual ?? 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!enviando) onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar pacote — NF + boleto + cópia do pedido</DialogTitle>
          <DialogDescription>
            Confirme para quem o pacote vai. O endereço aqui substitui o e-mail do cadastro neste envio.
          </DialogDescription>
        </DialogHeader>

        {linha?.lastro_envio === "bloqueado" && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Este endereço está na lista de supressão do provedor. O envio vai falhar até o endereço ser liberado.
            </AlertDescription>
          </Alert>
        )}

        {linha?.pacote_enviado_em && (
          <Alert>
            <AlertDescription className="text-xs">
              Este pacote já foi enviado em {fmtDataHora(linha.pacote_enviado_em)}. Enviar de novo?
            </AlertDescription>
          </Alert>
        )}

        <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-1">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Cliente</span>
            <span className="font-medium text-right">
              {linha?.nome_exibicao ?? linha?.apelido ?? linha?.nome_canonico ?? "—"}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Pedido</span>
            <span className="font-medium">{linha?.pedido ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">NF</span>
            <span className="font-medium">{linha?.nf_numero ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Valor das parcelas</span>
            <span className="font-mono tabular-nums font-medium">{fmtBRL(total)}</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pacote-destinatario">Destinatário</Label>
            <Input
              id="pacote-destinatario"
              type="email"
              placeholder="financeiro@cliente.com.br"
              value={destinatario}
              onChange={(e) => setDestinatario(e.target.value)}
              aria-invalid={!!erroDestinatario}
            />
            {erroDestinatario && (
              <p className="text-[11px] text-destructive">{erroDestinatario}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pacote-cc">Em cópia (CC)</Label>
            <Input
              id="pacote-cc"
              placeholder="comercial@cliente.com.br, compras@cliente.com.br"
              value={ccTexto}
              onChange={(e) => setCcTexto(e.target.value)}
              aria-invalid={!!erroCc}
            />
            <p className="text-[11px] text-muted-foreground">
              Vários e-mails separados por vírgula. Opcional.
            </p>
            {erroCc && <p className="text-[11px] text-destructive">{erroCc}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={() => { void handleEnviar(); }} disabled={!podeEnviar}>
            {enviando ? (
              <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Enviando…</>
            ) : (
              <><Send className="mr-1 h-4 w-4" />Enviar pacote</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
