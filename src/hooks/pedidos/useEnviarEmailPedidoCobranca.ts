import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { gerarPedidoPdf } from "@/lib/pedidoPdf";
import { fetchPedidoParaExportar } from "@/hooks/pedidos/usePedidoParaExportar";
import { ehBrCodePix } from "@/lib/financeiro/instrumento-pagamento";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s?: string | null) =>
  s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "";

export function useEnviarEmailPedidoCobranca() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pedido_id, emails, cc, reenvio }: { pedido_id: string; emails: string[]; cc?: string[]; reenvio?: boolean }) => {
      const exp = await fetchPedidoParaExportar(pedido_id);
      const pedido = exp.pedido;
      const parceiro = exp.parceiro;

      // ── Link de pagamento: view vw_pedido_link_pagamento -> fallback antigo ──
      let link_pagamento: string | null = null;
      let tipo_do_link: string | null = null;
      let situacao_link: string | null = null;
      let expira_em: string | null = null;
      let pix_txid: string | null = null;

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
            .select("link_pagamento, tipo_pagamento, pix_txid")
            .eq("pedido_id", pedido_id)
            .eq("status", "provisorio")
            .not("link_pagamento", "is", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (portao?.link_pagamento) {
            link_pagamento = portao.link_pagamento;
            tipo_do_link = portao.tipo_pagamento ?? null;
            pix_txid = portao.pix_txid ?? null;
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

      // BR Code PIX (EMV) não é URL e não expira: travas (b) e (c) não se aplicam.
      const ehBrCode = ehBrCodePix(link_pagamento);

      // (b) link malformado
      if (link_pagamento && !ehBrCode && !/^https?:\/\//i.test(link_pagamento.trim())) {
        throw new Error(
          `Link inválido no cadastro ("${link_pagamento}"). Cadastre a URL completa do SafraPay antes de enviar.`,
        );
      }

      // (c) link vencido
      if (!ehBrCode && situacao_link === "expirado") {
        throw new Error(
          `Link de pagamento vencido em ${fmtDate(expira_em)}. Gere um link novo no SafraPay e cole antes de enviar — o cliente receberia um link morto.`,
        );
      }


      const pdfBase64 = gerarPedidoPdf(exp.pdf);

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

      // Mesmos números do PDF anexado (fonte única: exp.pdf)
      const descontoPdf = Number(exp.pdf.desconto_valor ?? 0);
      const bonusPix = Number(exp.pdf.bonus_pix_valor ?? 0);
      const fretePdf = Number(exp.pdf.valor_frete ?? 0);

      if (descontoPdf > 0) templateData.desconto = `-${fmtBRL.format(descontoPdf)}`;
      if (bonusPix > 0) templateData.bonus_pix = `-${fmtBRL.format(bonusPix)}`;
      if (exp.frete_entra_no_liquido && fretePdf > 0) {
        templateData.valor_frete = `+${fmtBRL.format(fretePdf)}`;
      } else if (fretePdf > 0) {
        templateData.frete_por_conta_fetely = true;
      }
      if (link_pagamento) templateData.link_pagamento = link_pagamento;

      if (ehBrCode) {
        // txid do portão: cai no extrato bancário, ajuda o cliente e a conciliação.
        if (!pix_txid) {
          const { data: portaoTx } = await (supabase as any)
            .from("pedido_portao")
            .select("pix_txid")
            .eq("pedido_id", pedido_id)
            .eq("status", "provisorio")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          pix_txid = portaoTx?.pix_txid ?? null;
        }
        if (pix_txid) templateData.pix_txid = pix_txid;
      }

      const idempotencyKey = reenvio
        ? `cobranca-pedido-${pedido_id}-r${Date.now()}`
        : `cobranca-pedido-${pedido_id}`;

      const { data: respEmail, error: errEmail } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "cobranca-pedido",
          recipientEmail: emails[0],
          ...(emails.length > 1 ? { cc: emails.slice(1) } : {}),
          idempotencyKey,
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

      // Duplicata: o Resend barrou pela chave idempotente. Sucesso informativo —
      // não marca títulos nem link como reenviados, porque nada saiu agora.
      if ((respEmail as any)?.duplicate === true) {
        return { email: emails[0], id_externo: pedido.id_externo, duplicate: true as const };
      }

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


      return { email: emails[0], id_externo: pedido.id_externo, duplicate: false as const };
    },
    onSuccess: (data, vars) => {
      if (data.duplicate) {
        toast({
          title: "Cobrança já enviada",
          description: "Esta cobrança já havia sido enviada antes — nada foi reenviado.",
        });
      } else {
        toast({
          title: "Email de cobrança enviado",
          description: `Enviado para ${data.email} · ${data.id_externo}`,
        });
      }
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", vars.pedido_id] });
      qc.invalidateQueries({ queryKey: ["pedido-titulos", vars.pedido_id] });
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao enviar email", description: e.message, variant: "destructive" });
    },
  });
}
