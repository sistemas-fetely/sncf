import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s?: string | null) =>
  s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "";

export function useEnviarEmailCobranca() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (arg: string | { titulo_id: string; destinatarios?: string[] }) => {
      const titulo_id = typeof arg === "string" ? arg : arg.titulo_id;
      const destinatariosCustom = typeof arg === "string" ? undefined : arg.destinatarios;
      // 1. Busca título
      const { data: titulo, error: errT } = await (supabase as any)
        .from("titulo_a_receber")
        .select("id, pedido_id, tipo_pagamento, valor_bruto, data_vencimento_original, link_pagamento, numero_parcela, total_parcelas")
        .eq("id", titulo_id)
        .maybeSingle();
      if (errT || !titulo) throw new Error("Título não encontrado");
      if (!titulo.link_pagamento) throw new Error("Título sem link de pagamento — informe o link antes de enviar");

      // 2. Busca pedido + parceiro
      const { data: pedido } = await (supabase as any)
        .from("pedidos")
        .select("id_externo, parceiro_id")
        .eq("id", titulo.pedido_id)
        .maybeSingle();
      if (!pedido) throw new Error("Pedido não encontrado");

      const { data: parceiro } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("razao_social, email, email_cobranca")
        .eq("id", pedido.parceiro_id)
        .maybeSingle();
      const emailPadrao = parceiro?.email_cobranca || parceiro?.email;
      const destinatarios = destinatariosCustom?.length ? destinatariosCustom : (emailPadrao ? [emailPadrao] : []);
      if (destinatarios.length === 0) throw new Error("Parceiro sem email cadastrado — atualize o cadastro antes de enviar");

      // 3. Monta tipo legível
      const tipoLabel: Record<string, string> = {
        cartao: "Cartão de Crédito",
        cartao_credito: "Cartão de Crédito",
        cartao_debito: "Cartão de Débito",
        pix: "PIX",
      };
      const tipo = tipoLabel[titulo.tipo_pagamento] ?? titulo.tipo_pagamento ?? "Link";

      // 4. Envia email
      const { error: errEmail } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "link-cobranca",
          recipientEmail: destinatarios[0],
          cc: destinatarios.slice(1),
          idempotencyKey: `link-cobranca-${titulo_id}-${destinatarios.join(",")}`,
          templateData: {
            parceiro_nome: parceiro.razao_social,
            tipo,
            link_pagamento: titulo.link_pagamento,
            valor: fmtBRL.format(Number(titulo.valor_bruto)),
            vencimento: fmtDate(titulo.data_vencimento_original),
            pedido_id_externo: pedido.id_externo,
            numero_parcela: String(titulo.numero_parcela ?? "1"),
            total_parcelas: String(titulo.total_parcelas ?? "1"),
          },
        },
      });
      if (errEmail) throw new Error(`Falha ao enviar email: ${errEmail.message}`);

      // 5. Marca timestamp
      await (supabase as any)
        .from("titulo_a_receber")
        .update({ email_cobranca_enviado_em: new Date().toISOString() })
        .eq("id", titulo_id);

      return { email: destinatarios.join(", "), pedido_id_externo: pedido.id_externo };
    },
    onSuccess: (data) => {
      toast({
        title: "Email de cobrança enviado",
        description: `Enviado para ${data.email} · Pedido ${data.pedido_id_externo}`,
      });
      qc.invalidateQueries({ queryKey: ["contas-receber-titulos"] });
      qc.invalidateQueries({ queryKey: ["titulos-cobranca"] });
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao enviar email", description: e.message, variant: "destructive" });
    },
  });
}
