import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ConfirmarEnvioEmailDialog } from "@/components/credito/ConfirmarEnvioEmailDialog";
import { useEnviarEmailBoletosLote } from "@/hooks/credito/useEnviarEmailBoleto";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

interface Props {
  tituloId: string;
  emailPadrao: string | null;
}

interface TituloAcordo {
  id: string;
  numero_titulo: string | null;
  valor_bruto: number;
  data_vencimento_original: string | null;
}

/** Envia todos os boletos abertos e enviáveis do acordo do título em UM e-mail. */
export function EnviarBoletosAcordoBotao({ tituloId, emailPadrao }: Props) {
  const [aberto, setAberto] = useState(false);
  const enviar = useEnviarEmailBoletosLote();

  const { data } = useQuery({
    queryKey: ["boletos-acordo-enviaveis", tituloId],
    queryFn: async () => {
      const sb = supabase as any;
      const { data: t, error } = await sb.from("titulo_a_receber").select("acordo_id").eq("id", tituloId).maybeSingle();
      if (error) throw error;
      if (!t?.acordo_id) return null;
      const { data: lista, error: e2 } = await sb
        .from("titulo_a_receber")
        .select("id, numero_titulo, valor_bruto, data_vencimento_original")
        .eq("acordo_id", t.acordo_id)
        .eq("status", "aberto")
        .eq("tipo_pagamento", "boleto")
        .in("boleto_status", ["registrado", "remessa_gerada"])
        .not("linha_digitavel", "is", null)
        .order("data_vencimento_original");
      if (e2) throw e2;
      return { acordo_id: t.acordo_id as string, titulos: (lista ?? []) as TituloAcordo[] };
    },
  });

  if (!data || data.titulos.length === 0) return null;
  const n = data.titulos.length;
  const total = data.titulos.reduce((s, t) => s + Number(t.valor_bruto || 0), 0);

  return (
    <>
      <Button variant="outline" size="sm" disabled={enviar.isPending} onClick={() => setAberto(true)}>
        {enviar.isPending ? "Enviando..." : `Enviar todos os boletos do acordo (${n})`}
      </Button>
      {aberto && (
        <ConfirmarEnvioEmailDialog
          open={aberto}
          onOpenChange={setAberto}
          titulo={{ numero_titulo: `${n} boletos`, valor_efetivo: total, data_vencimento_atual: data.titulos[0].data_vencimento_original }}
          emailPadrao={emailPadrao}
          loading={enviar.isPending}
          titleLabel={`Enviar ${n} boletos do acordo em um e-mail`}
          itens={data.titulos.map((t) => `${t.numero_titulo ?? "—"} · ${formatBRL(Number(t.valor_bruto))} · venc. ${formatDateBR(t.data_vencimento_original)}`)}
          onConfirm={(destinatarios) =>
            enviar.mutate(
              { titulo_ids: data.titulos.map((t) => t.id), destinatarios, acordo_id: data.acordo_id },
              { onSuccess: () => setAberto(false) },
            )
          }
        />
      )}
    </>
  );
}
