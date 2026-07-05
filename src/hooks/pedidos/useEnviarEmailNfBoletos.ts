import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function fmtDataBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  // Aceita 'YYYY-MM-DD' ou ISO completo
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  if (!y || !m || !d) return String(iso);
  return `${d}/${m}/${y}`;
}

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

      // b) Títulos boleto
      const { data: titulosRaw, error: errT } = await (supabase as any)
        .from("titulo_a_receber")
        .select("id, numero_parcela, total_parcelas, data_vencimento_atual, valor_bruto, boleto_status, linha_digitavel")
        .eq("pedido_id", pedido_id)
        .eq("tipo_pagamento", "boleto")
        .order("numero_parcela", { ascending: true });
      if (errT) throw new Error(errT.message);
      const titulos = (titulosRaw ?? []) as any[];
      if (!titulos.length) throw new Error("Pedido não possui títulos de boleto.");
      const enviaveis = new Set(["registrado", "remessa_gerada", "vencido"]);
      const pendentes = titulos.filter(
        (t) => !enviaveis.has(t.boleto_status) || !t.linha_digitavel,
      );
      if (pendentes.length > 0) {
        // Mensagem específica: mostra o status real do primeiro bloqueio
        const bloqueio = pendentes[0];
        const statusReal = bloqueio.boleto_status ?? "sem status";
        let msg: string;
        if (!bloqueio.linha_digitavel) {
          msg = `Parcela ${bloqueio.numero_parcela} sem linha digitável — gere a remessa Safra antes de enviar.`;
        } else if (statusReal === "rejeitado") {
          msg = `Boleto rejeitado pelo banco (parcela ${bloqueio.numero_parcela}) — corrija e gere nova remessa.`;
        } else if (statusReal === "pendente") {
          msg = `Boleto pendente (parcela ${bloqueio.numero_parcela}) — gere a remessa Safra antes de enviar.`;
        } else {
          msg = `Boleto em status "${statusReal}" (parcela ${bloqueio.numero_parcela}) — não pode ser enviado.`;
        }
        throw new Error(msg);
      }

      // c) NF (PDF + XML)
      const { data: anexosResp, error: anexosErr } = await supabase.functions.invoke(
        "enviar-pedido-bling",
        { body: { acao: "anexos_nf", pedido_id } },
      );
      if (anexosErr) throw new Error(anexosErr.message || "Falha ao buscar NF");
      if (!anexosResp?.sucesso) throw new Error(anexosResp?.erro || "Falha ao buscar NF");
      const nfAttachments = anexosResp.attachments ?? [];
      const nf_numeros: string[] = anexosResp.nf_numeros ?? [];
      if (!nfAttachments.length) throw new Error("Nenhum anexo de NF disponível");

      // d) Boletos PDF
      const boletoAttachments: Array<{ filename: string; content: string }> = [];
      for (const t of titulos) {
        const { data: bResp, error: bErr } = await supabase.functions.invoke(
          "gerar-boleto-pdf",
          { body: { titulo_id: t.id } },
        );
        if (bErr) throw new Error(`Falha ao gerar boleto da parcela ${t.numero_parcela}: ${bErr.message}`);
        if (!bResp?.ok) throw new Error(`Falha ao gerar boleto da parcela ${t.numero_parcela}: ${bResp?.erro ?? "erro desconhecido"}`);
        boletoAttachments.push({ filename: bResp.nome_arquivo, content: bResp.pdf_base64 });
      }

      // e) Lista pro template
      const boletos = titulos.map((t) => ({
        parcela: `${t.numero_parcela}/${t.total_parcelas}`,
        vencimento: fmtDataBR(t.data_vencimento_atual),
        valor: fmtBRL.format(Number(t.valor_bruto ?? 0)),
        linha_digitavel: t.linha_digitavel,
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
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao enviar NF + boletos", description: e.message, variant: "destructive" });
    },
  });
}
