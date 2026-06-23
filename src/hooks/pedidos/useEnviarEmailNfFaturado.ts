import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function useEnviarEmailNfFaturado() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      pedido_id,
      emails,
      cc,
      skipEstagioCheck,
    }: { pedido_id: string; emails: string[]; cc?: string[]; skipEstagioCheck?: boolean }) => {
      const { data: pedido, error: errP } = await (supabase as any)
        .from("pedidos")
        .select("*")
        .eq("id", pedido_id)
        .maybeSingle();
      if (errP || !pedido) throw new Error("Pedido não encontrado");
      if (!skipEstagioCheck && pedido.estagio !== "faturado") throw new Error("Pedido não está faturado");

      const { data: parceiro } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("razao_social, email")
        .eq("id", pedido.parceiro_id)
        .maybeSingle();

      // 1) Buscar anexos (PDF + XML) via edge enviar-pedido-bling (branch anexos_nf)
      const { data: anexosResp, error: anexosErr } = await supabase.functions.invoke(
        "enviar-pedido-bling",
        { body: { acao: "anexos_nf", pedido_id } },
      );
      if (anexosErr) throw new Error(anexosErr.message || "Falha ao buscar NF");
      if (!anexosResp?.sucesso) {
        throw new Error(anexosResp?.erro || "Falha ao buscar NF");
      }
      const attachments = anexosResp.attachments ?? [];
      const nf_numeros: string[] = anexosResp.nf_numeros ?? [];
      if (!attachments.length) throw new Error("Nenhum anexo de NF disponível");

      const templateData: Record<string, any> = {
        parceiro_nome: parceiro?.razao_social,
        pedido_id_externo: pedido.id_externo,
        nf_numero: nf_numeros[0],
        valor_liquido: fmtBRL.format(Number(pedido.valor_liquido ?? 0)),
      };

      // 2) Enviar e-mail
      const { error: errEmail } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "nf-entrega",
          recipientEmail: emails[0],
          ...(emails.length > 1 ? { cc: emails.slice(1) } : {}),
          ...(cc && cc.length > 0 ? { cc } : {}),
          idempotencyKey: `nf-entrega-${pedido_id}-${Date.now()}`,
          templateData,
          attachments,
        },
      });
      if (errEmail) throw new Error(`Falha ao enviar email: ${errEmail.message}`);

      // 3) Marcar pedido
      await (supabase as any)
        .from("pedidos")
        .update({ nf_email_enviado_em: new Date().toISOString() })
        .eq("id", pedido_id);

      return { email: emails[0], id_externo: pedido.id_externo };
    },
    onSuccess: (data, vars) => {
      toast({
        title: "NF enviada por e-mail",
        description: `Enviada para ${data.email} · ${data.id_externo}`,
      });
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", vars.pedido_id] });
      qc.invalidateQueries({ queryKey: ["pedido-titulos", vars.pedido_id] });
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao enviar NF", description: e.message, variant: "destructive" });
    },
  });
}
