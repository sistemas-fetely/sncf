import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { montarPacoteCobranca, type TituloPacote } from "@/lib/financeiro/montar-pacote-cobranca";

export function useEnviarEmailNfBoletos() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      pedido_id,
      emails,
      cc,
      skipEstagioCheck,
    }: { pedido_id: string; emails: string[]; cc?: string[]; skipEstagioCheck?: boolean }) => {
      // a) Pedido + parceiro
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

      // b) TODOS os títulos do pedido — o montador é quem recorta por status/instrumento
      const { data: titulosRaw, error: errT } = await (supabase as any)
        .from("titulo_a_receber")
        .select(
          "id, numero_parcela, total_parcelas, data_vencimento_atual, valor_bruto, status, tipo_pagamento, boleto_status, linha_digitavel, pix_txid, pix_qr_url, pix_token, link_pagamento",
        )
        .eq("pedido_id", pedido_id)
        .order("numero_parcela", { ascending: true });
      if (errT) throw new Error(errT.message);

      const pacote = montarPacoteCobranca((titulosRaw ?? []) as TituloPacote[]);

      // c) NF (PDF sempre; XML só no envio de faturamento)
      const { data: anexosResp, error: anexosErr } = await supabase.functions.invoke(
        "enviar-pedido-bling",
        { body: { acao: "anexos_nf", pedido_id } },
      );
      if (anexosErr) throw new Error(anexosErr.message || "Falha ao buscar NF");
      if (!anexosResp?.sucesso) throw new Error(anexosResp?.erro || "Falha ao buscar NF");
      const todosAnexosNf: Array<{ filename: string; content: string }> = anexosResp.attachments ?? [];
      const nfAttachments = skipEstagioCheck
        ? todosAnexosNf.filter((a) => !/\.xml$/i.test(a.filename ?? ""))
        : todosAnexosNf;
      const nf_numeros: string[] = anexosResp.nf_numeros ?? [];
      if (!nfAttachments.length) throw new Error("Nenhum anexo de NF disponível");

      // d) Boletos PDF — só dos títulos abertos de boleto
      const boletoAttachments: Array<{ filename: string; content: string }> = [];
      for (const t of pacote.titulosBoleto) {
        const { data: bResp, error: bErr } = await supabase.functions.invoke(
          "gerar-boleto-pdf",
          { body: { titulo_id: t.id } },
        );
        if (bErr) throw new Error(`Falha ao gerar boleto da parcela ${t.numero_parcela}: ${bErr.message}`);
        if (!bResp?.ok) throw new Error(`Falha ao gerar boleto da parcela ${t.numero_parcela}: ${bResp?.erro ?? "erro desconhecido"}`);
        boletoAttachments.push({ filename: bResp.nome_arquivo, content: bResp.pdf_base64 });
      }

      // e) Lista pro template (já formatada pelo montador)
      const boletos = pacote.boletos.map((b) => ({
        parcela: b.parcela,
        vencimento: b.vencimento,
        valor: b.valor,
        linha_digitavel: b.linha_digitavel,
      }));

      // f) attachments finais
      const attachments = [...nfAttachments, ...boletoAttachments];

      // g) Enviar
      const { error: errEmail } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "nf-entrega-boleto",
          recipientEmail: emails[0],
          ...(emails.length > 1 ? { cc: emails.slice(1) } : {}),
          ...(cc && cc.length > 0 ? { cc } : {}),
          idempotencyKey: `nf-boletos-${pedido_id}-${Date.now()}`,
          templateData: {
            parceiro_nome: parceiro?.razao_social,
            pedido_id_externo: pedido.id_externo,
            nf_numero: nf_numeros[0],
            boletos,
            pix: pacote.pix,
            tem_pix: pacote.temPix,
            instrumento_texto: pacote.instrumentoTexto ?? undefined,
            tem_xml: !skipEstagioCheck,
          },

          attachments,
        },
      });
      if (errEmail) throw new Error(`Falha ao enviar email: ${errEmail.message}`);

      // h) Marcar pedido
      await (supabase as any)
        .from("pedidos")
        .update({ nf_email_enviado_em: new Date().toISOString() })
        .eq("id", pedido_id);

      return { email: emails[0], id_externo: pedido.id_externo };
    },

    onSuccess: (data, vars) => {
      toast({
        title: "NF + boletos enviados",
        description: `Enviado para ${data.email} · ${data.id_externo}`,
      });
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", vars.pedido_id] });
      qc.invalidateQueries({ queryKey: ["boletos-do-pedido", vars.pedido_id] });
      qc.invalidateQueries({ queryKey: ["boletos-safra"] });
      qc.invalidateQueries({ queryKey: ["cobranca-mesa"] });
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao enviar NF + boletos", description: e.message, variant: "destructive" });
    },
  });
}
