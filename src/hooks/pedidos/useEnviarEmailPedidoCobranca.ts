import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { gerarPedidoPdf } from "@/lib/pedidoPdf";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s?: string | null) =>
  s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "";

export function useEnviarEmailPedidoCobranca() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pedido_id, emails, cc }: { pedido_id: string; emails: string[]; cc?: string[] }) => {
      const { data: pedido, error: errP } = await (supabase as any)
        .from("pedidos")
        .select("*")
        .eq("id", pedido_id)
        .maybeSingle();
      if (errP || !pedido) throw new Error("Pedido não encontrado");

      const { data: parceiro } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("razao_social, email")
        .eq("id", pedido.parceiro_id)
        .maybeSingle();

      const { data: itens } = await (supabase as any)
        .from("pedido_itens")
        .select("descricao, sku, quantidade, valor_unitario")
        .eq("pedido_id", pedido_id)
        .order("ordem");
      const itensArr = (itens ?? []).map((it: any) => ({
        ...it,
        subtotal: Number(it.quantidade) * Number(it.valor_unitario),
      }));

      // ── Link de pagamento: view vw_pedido_link_pagamento -> fallback antigo ──
      let link_pagamento: string | null = null;
      let tipo_do_link: string | null = null;
      let situacao_link: string | null = null;
      let expira_em: string | null = null;

      const { data: linkView } = await (supabase as any)
        .from("vw_pedido_link_pagamento")
        .select("link, tipo_pagamento, situacao, expira_em")
        .eq("pedido_id", pedido_id)
        .maybeSingle();

      if (linkView?.link) {
        link_pagamento = linkView.link;
        tipo_do_link = linkView.tipo_pagamento ?? null;
        situacao_link = linkView.situacao ?? null;
        expira_em = linkView.expira_em ?? null;
      } else {
        const { data: tituloComLink } = await (supabase as any)
          .from("titulo_a_receber")
          .select("link_pagamento, tipo_pagamento")
          .eq("pedido_id", pedido_id)
          .not("link_pagamento", "is", null)
          .limit(1)
          .maybeSingle();
        if (tituloComLink?.link_pagamento) {
          link_pagamento = tituloComLink.link_pagamento;
          tipo_do_link = tituloComLink.tipo_pagamento ?? null;
        }

        if (!link_pagamento) {
          const { data: portao } = await (supabase as any)
            .from("pedido_portao")
            .select("link_pagamento, tipo_pagamento")
            .eq("pedido_id", pedido_id)
            .eq("status", "provisorio")
            .not("link_pagamento", "is", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (portao?.link_pagamento) {
            link_pagamento = portao.link_pagamento;
            tipo_do_link = portao.tipo_pagamento ?? null;
          }
        }

        if (!link_pagamento) {
          link_pagamento = pedido.link_pagamento ?? null;
        }
      }

      // Tipo que o template usa pra decidir o layout (botao de cartao, QR pix, etc.)
      const tipo_pagamento = tipo_do_link ?? pedido.forma_solicitada ?? "";
      const tipoNorm = tipo_pagamento.toString().toLowerCase();
      const exigeLink = tipoNorm.includes("cart") || tipoNorm.includes("pix");

      // ── TRAVA FAIL-LOUD ──
      // (a) cartao/PIX sem link nenhum
      if (exigeLink && !link_pagamento) {
        throw new Error(
          "Sem link de pagamento para este pedido. Informe o link (na cobrança/portão) antes de enviar — o cliente receberia um e-mail sem como pagar.",
        );
      }

      // (b) link malformado
      if (link_pagamento && !/^https?:\/\//i.test(link_pagamento.trim())) {
        throw new Error(
          `Link inválido no cadastro ("${link_pagamento}"). Cadastre a URL completa do SafraPay antes de enviar.`,
        );
      }

      // (c) link vencido
      if (situacao_link === "expirado") {
        throw new Error(
          `Link de pagamento vencido em ${fmtDate(expira_em)}. Gere um link novo no SafraPay e cole antes de enviar — o cliente receberia um link morto.`,
        );
      }


      const pdfBase64 = gerarPedidoPdf({
        id_externo: pedido.id_externo,
        data_pedido: fmtDate(pedido.data_pedido),
        parceiro_nome: parceiro?.razao_social,
        forma_pagamento: pedido.forma_solicitada ?? "",
        condicao_pagamento: pedido.condicao_solicitada ?? undefined,
        valor_bruto: Number(pedido.valor_bruto ?? 0),
        desconto_pct: Number(pedido.desconto_pct ?? 0),
        valor_frete: Number(pedido.valor_frete ?? 0),
        valor_liquido: Number(pedido.valor_liquido ?? 0),
        itens: itensArr,
      });

      const descontoValor =
        Number(pedido.valor_bruto ?? 0) * (Number(pedido.desconto_pct ?? 0) / 100);
      const templateData: Record<string, any> = {
        parceiro_nome: parceiro?.razao_social,
        pedido_id_externo: pedido.id_externo,
        data_pedido: fmtDate(pedido.data_pedido),
        forma_pagamento: pedido.forma_solicitada ?? "",
        tipo_pagamento,
        condicao_pagamento: pedido.condicao_solicitada ?? undefined,
        valor_bruto: fmtBRL.format(Number(pedido.valor_bruto ?? 0)),
        valor_liquido: fmtBRL.format(Number(pedido.valor_liquido ?? 0)),
      };
      if (descontoValor > 0) templateData.desconto = `-${fmtBRL.format(descontoValor)}`;
      if (Number(pedido.valor_frete ?? 0) > 0)
        templateData.valor_frete = `+${fmtBRL.format(Number(pedido.valor_frete))}`;
      if (link_pagamento) templateData.link_pagamento = link_pagamento;

      const { error: errEmail } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "cobranca-pedido",
          recipientEmail: emails[0],
          ...(emails.length > 1 ? { cc: emails.slice(1) } : {}),
          idempotencyKey: `cobranca-pedido-${pedido_id}-${Date.now()}`,
          templateData,
          attachments: [
            {
              filename: `pedido_${pedido.id_externo}.pdf`,
              content: pdfBase64,
            },
          ],
          ...(cc && cc.length > 0 ? { cc } : {}),
        },
      });
      if (errEmail) throw new Error(`Falha ao enviar email: ${errEmail.message}`);

      // Marca os titulos em aberto como "email enviado" (no-op se ainda nao ha titulos — portao)
      await (supabase as any)
        .from("titulo_a_receber")
        .update({ email_cobranca_enviado_em: new Date().toISOString() })
        .eq("pedido_id", pedido_id)
        .not("status", "in", "(cancelado,pago,pago_com_atraso,pago_judicial,baixado_por_perda)");

      // Marca o link ativo como reenviado ao cliente (nao derruba o envio se falhar)
      try {
        const { error: errMarcar } = await (supabase as any).rpc("marcar_link_enviado", {
          p_pedido_id: pedido_id,
        });
        if (errMarcar) console.error("marcar_link_enviado falhou:", errMarcar);
      } catch (e) {
        console.error("marcar_link_enviado falhou:", e);
      }


      return { email: emails[0], id_externo: pedido.id_externo };
    },
    onSuccess: (data, vars) => {
      toast({
        title: "Email de cobrança enviado",
        description: `Enviado para ${data.email} · ${data.id_externo}`,
      });
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", vars.pedido_id] });
      qc.invalidateQueries({ queryKey: ["pedido-titulos", vars.pedido_id] });
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao enviar email", description: e.message, variant: "destructive" });
    },
  });
}
