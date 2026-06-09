import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s?: string | null) =>
  s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "";

export function useEnviarEmailBoleto() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (titulo_id: string) => {
      // 1. Busca título
      const { data: titulo, error: errT } = await (supabase as any)
        .from("titulo_a_receber")
        .select("id, pedido_id, valor_bruto, data_vencimento_original, linha_digitavel, numero_parcela, total_parcelas, boleto_status, nosso_numero_safra")
        .eq("id", titulo_id)
        .maybeSingle();
      if (errT || !titulo) throw new Error("Título não encontrado");
      if (titulo.boleto_status !== "registrado")
        throw new Error("Boleto precisa estar com status 'registrado' para enviar email");
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
        .select("razao_social, email")
        .eq("id", pedido.parceiro_id)
        .maybeSingle();
      if (!parceiro?.email)
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
          recipientEmail: parceiro.email,
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

      return { email: parceiro.email, pedido_id_externo: pedido.id_externo };
    },
    onSuccess: (data) => {
      toast({
        title: "Boleto enviado por email",
        description: `Enviado para ${data.email} · Pedido ${data.pedido_id_externo}`,
      });
      qc.invalidateQueries({ queryKey: ["banco-safra-boletos"] });
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao enviar boleto", description: e.message, variant: "destructive" });
    },
  });
}
