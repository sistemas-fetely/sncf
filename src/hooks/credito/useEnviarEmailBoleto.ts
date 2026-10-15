import { useMutation } from "@tanstack/react-query";
import { useInvalidarRecebivel } from "@/hooks/recebivel/useInvalidarRecebivel";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s?: string | null) =>
  s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "";

export function useEnviarEmailBoleto() {
  const invalidarRecebivel = useInvalidarRecebivel();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (arg: string | { titulo_id: string; destinatarios?: string[] }) => {
      const titulo_id = typeof arg === "string" ? arg : arg.titulo_id;
      const destinatariosCustom = typeof arg === "string" ? undefined : arg.destinatarios;
      // 1. Busca título
      const { data: titulo, error: errT } = await (supabase as any)
        .from("titulo_a_receber")
        .select("id, pedido_id, valor_bruto, data_vencimento_original, linha_digitavel, numero_parcela, total_parcelas, boleto_status, nosso_numero_safra")
        .eq("id", titulo_id)
        .maybeSingle();
      if (errT || !titulo) throw new Error("Título não encontrado");
      // Envio liberado ja em 'remessa_gerada': o banco nao aceita pagamento de
      // titulo nao registrado, logo nao ha dinheiro em limbo. Bloquear o envio
      // custaria certo e recorrente. So barra instrumento morto/rejeitado.
      if (!["registrado", "remessa_gerada"].includes(titulo.boleto_status ?? ""))
        throw new Error(
          `Boleto com status '${titulo.boleto_status ?? "—"}' não pode ser enviado ao cliente — reemita antes.`,
        );
      if (!titulo.linha_digitavel)
        throw new Error("Boleto sem linha digitável — gere a remessa Safra primeiro");

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
      if (destinatarios.length === 0)
        throw new Error("Parceiro sem email cadastrado — atualize o cadastro antes de enviar");

      // 3. Gera PDF do boleto
      const { data: pdfResp, error: errPdf } = await supabase.functions.invoke("gerar-boleto-pdf", {
        body: { titulo_id },
      });
      if (errPdf || !pdfResp?.ok)
        throw new Error(`Falha ao gerar PDF: ${pdfResp?.erro ?? errPdf?.message ?? "erro desconhecido"}`);

      const { pdf_base64, nome_arquivo } = pdfResp;

      // 4. Envia email com PDF anexo
      const { error: errEmail } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "boleto-safra",
          recipientEmail: destinatarios[0],
          cc: destinatarios.slice(1),
          idempotencyKey: `boleto-safra-${titulo_id}`,
          templateData: {
            parceiro_nome:  parceiro.razao_social,
            numero_parcela: String(titulo.numero_parcela ?? "1"),
            total_parcelas: String(titulo.total_parcelas ?? "1"),
            valor:          fmtBRL.format(Number(titulo.valor_bruto)),
            vencimento:     fmtDate(titulo.data_vencimento_original),
            linha_digitavel: titulo.linha_digitavel,
            pedido_id_externo: pedido.id_externo,
          },
          attachments: [
            { filename: nome_arquivo, content: pdf_base64 },
          ],
        },
      });
      if (errEmail) throw new Error(`Falha ao enviar email: ${errEmail.message}`);

      // 5. Marca timestamp
      await (supabase as any)
        .from("titulo_a_receber")
        .update({ boleto_enviado_em: new Date().toISOString() })
        .eq("id", titulo_id);

      return { email: destinatarios.join(", "), pedido_id_externo: pedido.id_externo };
    },
    onSuccess: async (data) => {
      await invalidarRecebivel();
      toast({
        title: "Boleto enviado por email",
        description: `Enviado para ${data.email} · Pedido ${data.pedido_id_externo}`,
      });
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao enviar boleto", description: e.message, variant: "destructive" });
    },
  });
}

// =====================================================
// Lote: todos os boletos (ex.: de um acordo) em UM e-mail. Tudo ou nada.
// =====================================================
export interface EnviarBoletosLoteInput {
  titulo_ids: string[];
  destinatarios?: string[];
  acordo_id?: string;
}

export function useEnviarEmailBoletosLote() {
  const invalidarRecebivel = useInvalidarRecebivel();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ titulo_ids, destinatarios: destCustom, acordo_id }: EnviarBoletosLoteInput) => {
      const ids = Array.from(new Set(titulo_ids));
      if (ids.length === 0) throw new Error("Nenhum título para enviar");
      const sb = supabase as any;

      const { data: titulos, error: errT } = await sb
        .from("titulo_a_receber")
        .select("id, numero_titulo, pedido_id, tipo_pagamento, valor_bruto, data_vencimento_original, linha_digitavel, numero_parcela, total_parcelas, boleto_status")
        .in("id", ids);
      if (errT) throw new Error(`Falha ao buscar títulos: ${errT.message}`);
      if ((titulos ?? []).length !== ids.length) throw new Error("Algum título não foi encontrado");

      const pedidoIds = Array.from(new Set((titulos as any[]).map((t) => t.pedido_id)));
      const { data: pedidos, error: errP } = await sb
        .from("pedidos").select("id, id_externo, parceiro_id").in("id", pedidoIds);
      if (errP) throw new Error(`Falha ao buscar pedidos: ${errP.message}`);
      const pedidoPor = new Map((pedidos ?? []).map((p: any) => [p.id, p]));

      const problemas: string[] = [];
      const parceiros = new Set<string>();
      for (const t of titulos as any[]) {
        const nome = t.numero_titulo ?? t.id;
        const ped: any = pedidoPor.get(t.pedido_id);
        if (!ped) { problemas.push(`${nome}: pedido não encontrado`); continue; }
        parceiros.add(ped.parceiro_id);
        if (t.tipo_pagamento !== "boleto") problemas.push(`${nome}: não é boleto`);
        if (!["registrado", "remessa_gerada"].includes(t.boleto_status ?? ""))
          problemas.push(`${nome}: boleto com status '${t.boleto_status ?? "—"}'`);
        if (!t.linha_digitavel) problemas.push(`${nome}: sem linha digitável`);
      }
      if (parceiros.size > 1) problemas.push("Os títulos são de clientes diferentes");
      if (problemas.length) throw new Error(`Nenhum boleto enviado. ${problemas.join("; ")}`);

      const parceiroId = Array.from(parceiros)[0];
      const { data: parceiro, error: errPc } = await sb
        .from("parceiros_comerciais").select("razao_social, email, email_cobranca").eq("id", parceiroId).maybeSingle();
      if (errPc) throw new Error(`Falha ao buscar cliente: ${errPc.message}`);
      const emailPadrao = parceiro?.email_cobranca || parceiro?.email;
      const destinatarios = destCustom?.length ? destCustom : (emailPadrao ? [emailPadrao] : []);
      if (destinatarios.length === 0) throw new Error("Cliente sem e-mail cadastrado — atualize o cadastro antes de enviar");

      let numeroAcordo: string | null = null;
      let nParcelasAcordo: number | null = null;
      if (acordo_id) {
        const { data: ac, error: errA } = await sb
          .from("acordo_renegociacao").select("numero_acordo, n_parcelas").eq("id", acordo_id).maybeSingle();
        if (errA) throw new Error(`Falha ao buscar acordo: ${errA.message}`);
        numeroAcordo = ac?.numero_acordo ?? null;
        nParcelasAcordo = ac?.n_parcelas ?? null;
      }

      const ordenados = [...(titulos as any[])].sort((a, b) =>
        (a.data_vencimento_original ?? "").localeCompare(b.data_vencimento_original ?? "") ||
        (a.numero_parcela ?? 0) - (b.numero_parcela ?? 0));

      const attachments: Array<{ filename: string; content: string }> = [];
      for (const t of ordenados) {
        const { data: pdf, error: errPdf } = await supabase.functions.invoke("gerar-boleto-pdf", { body: { titulo_id: t.id } });
        if (errPdf || !pdf?.ok)
          throw new Error(`Nenhum boleto enviado. Falha ao gerar PDF de ${t.numero_titulo ?? t.id}: ${pdf?.erro ?? errPdf?.message ?? "erro desconhecido"}`);
        attachments.push({ filename: pdf.nome_arquivo, content: pdf.pdf_base64 });
      }

      const total = ordenados.reduce((s, t) => s + Number(t.valor_bruto || 0), 0);
      const pedidoExt = (pedidoPor.get(ordenados[0].pedido_id) as any)?.id_externo ?? "";
      const { data: respEmail, error: errEmail } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "boleto-safra-lote",
          recipientEmail: destinatarios[0],
          cc: destinatarios.slice(1),
          idempotencyKey: `boletos-lote-${acordo_id ?? [...ids].sort().join("-")}`,
          templateData: {
            parceiro_nome: parceiro?.razao_social,
            numero_acordo: numeroAcordo,
            pedido_id_externo: pedidoExt,
            total: fmtBRL.format(total),
            parcelas: ordenados.map((t) => ({
              parcela: `${t.numero_parcela ?? "1"}/${nParcelasAcordo ?? t.total_parcelas ?? ordenados.length}`,
              vencimento: fmtDate(t.data_vencimento_original),
              valor: fmtBRL.format(Number(t.valor_bruto)),
              linha_digitavel: t.linha_digitavel,
            })),
          },
          attachments,
        },
      });
      if (errEmail || (respEmail as any)?.error)
        throw new Error(`Falha ao enviar e-mail: ${(respEmail as any)?.error ?? errEmail?.message}`);

      const { error: errUpd } = await sb
        .from("titulo_a_receber").update({ boleto_enviado_em: new Date().toISOString() }).in("id", ids);
      if (errUpd) throw new Error(`E-mail enviado, mas falhou ao marcar os boletos como enviados: ${errUpd.message}`);

      return { n: ids.length, email: destinatarios.join(", ") };
    },
    onSuccess: async (d) => {
      await invalidarRecebivel();
      toast({ title: `${d.n} boletos enviados em um e-mail para ${d.email}` });
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao enviar boletos", description: e.message, variant: "destructive" });
    },
  });
}
