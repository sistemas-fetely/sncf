import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { formatBRL } from "@/lib/format-currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Contexto do pedido para o envio do link de pagamento por e-mail. */
export interface EmailPagamentoCtx {
  pedidoId: string;
  idExterno: string | null;
  total: number | null;
  clienteNome: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const QK_ULTIMO = "vd-email-pagamento-ultimo";

const p2 = (n: number) => String(n).padStart(2, "0");
const carimbo = (d = new Date()) =>
  `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}`;
const fmtDH = (s: string | null | undefined) => {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

export function EnviarEmailPagamentoVD({
  ctx, meio, link, expiraEm,
}: { ctx: EmailPagamentoCtx; meio: "pix" | "cartao"; link: string | null; expiraEm?: string | null }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [email, setEmail] = useState("");

  const ultimoQ = useQuery({
    queryKey: [QK_ULTIMO, ctx.pedidoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedido_email_log")
        .select("destinatario, enviado_em")
        .eq("pedido_id", ctx.pedidoId)
        .eq("tipo_email", "link-cobranca")
        .order("enviado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const carregarEmail = async () => {
    const { data: ped, error: e1 } = await supabase
      .from("pedidos").select("parceiro_id").eq("id", ctx.pedidoId).maybeSingle();
    if (e1) throw e1;
    const pid = (ped as { parceiro_id: string | null } | null)?.parceiro_id;
    if (!pid) return "";
    const { data: par, error: e2 } = await supabase
      .from("parceiros_comerciais").select("email, email_cobranca").eq("id", pid).maybeSingle();
    if (e2) throw e2;
    const p = par as { email: string | null; email_cobranca: string | null } | null;
    return (p?.email_cobranca || p?.email || "").trim();
  };

  const abrir = async (v: boolean) => {
    setAberto(v);
    if (!v) return;
    try { setEmail(await carregarEmail()); }
    catch (e) { setEmail(""); toast.error(`Não foi possível ler o e-mail do cliente: ${rawMessage(e)}`); }
  };

  const m = useMutation({
    mutationFn: async () => {
      const dest = email.trim();
      if (!link) throw new Error("Sem link de pagamento vigente neste painel.");
      if (!EMAIL_RE.test(dest)) throw new Error("E-mail inválido.");
      const templateData: Record<string, string> = {
        parceiro_nome: ctx.clienteNome ?? "",
        tipo: meio === "pix" ? "PIX" : "Cartão de Crédito",
        link_pagamento: link,
        valor: formatBRL(ctx.total),
        pedido_id_externo: ctx.idExterno ?? "",
      };
      if (meio === "cartao" && expiraEm) {
        const v = fmtDH(expiraEm);
        const d = new Date(expiraEm);
        if (v) templateData.vencimento = `${v.slice(0, 5)}/${d.getFullYear()} ${v.slice(6)}`;
      }
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "link-cobranca",
          recipientEmail: dest,
          idempotencyKey: `vd-pagamento-${ctx.pedidoId}-${link.slice(-12)}-${dest}-${carimbo()}`,
          templateData,
        },
      });
      if (error) {
        let msg = error.message;
        try { const c = await (error as { context?: Response }).context?.json(); if (c?.error || c?.erro) msg = c.error ?? c.erro; } catch { /* mantém */ }
        throw new Error(msg);
      }
      const { error: eLog } = await supabase.from("pedido_email_log").insert({
        pedido_id: ctx.pedidoId,
        tipo_email: "link-cobranca",
        destinatario: dest,
        metadata: { meio, link },
      });
      if (eLog) throw new Error(`E-mail enviado, mas o registro falhou: ${eLog.message}`);
      return dest;
    },
    onSuccess: async (dest) => {
      toast.success(`E-mail enviado para ${dest}`);
      setAberto(false);
      await qc.invalidateQueries({ queryKey: [QK_ULTIMO, ctx.pedidoId] });
      await qc.invalidateQueries({ queryKey: ["pedido-email-log", ctx.pedidoId] });
    },
    onError: async (e) => {
      toast.error(rawMessage(e));
      await qc.invalidateQueries({ queryKey: [QK_ULTIMO, ctx.pedidoId] });
    },
  });

  const valido = EMAIL_RE.test(email.trim());
  const u = ultimoQ.data;

  return (
    <div className="flex flex-col gap-1">
      <Popover open={aberto} onOpenChange={(v) => void abrir(v)}>
        <PopoverTrigger asChild>
          <Button variant="outline" disabled={!link}>
            <Mail className="h-4 w-4" /> Enviar por e-mail
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="vd-email-pag">E-mail do cliente</Label>
            <Input id="vd-email-pag" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            {email.trim() && !valido && <p className="text-xs text-destructive">E-mail inválido.</p>}
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => m.mutate()} disabled={!valido || m.isPending}>
              {m.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Enviar
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {ultimoQ.isError ? (
        <span className="text-xs text-destructive">{rawMessage(ultimoQ.error)}</span>
      ) : u ? (
        <span className="text-xs text-muted-foreground">Último envio por e-mail: {u.destinatario} · {fmtDH(u.enviado_em)}</span>
      ) : null}
    </div>
  );
}
