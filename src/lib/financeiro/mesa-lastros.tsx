import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { LinhaMesa } from "@/lib/financeiro/adaptar-titulo-mesa";

/** Prova de envio: o máximo que o sistema sabe. */
export const AVISO_PROVA_ENVIO =
  "Prova de envio = o provedor de e-mail aceitou o envio. Não há confirmação de entrega ao destinatário nem de abertura do e-mail.";

export function fmtDataMesa(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  if (!y || !m || !d) return String(iso);
  return `${d}/${m}/${y}`;
}

export function fmtDataHoraMesa(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const dt = new Date(iso);
    const data = dt.toLocaleDateString("pt-BR");
    const hora = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return `${data} ${hora}`;
  } catch {
    return String(iso);
  }
}

export type SeloTom = "verde" | "ambar" | "vermelho" | "neutro";

export const TOM_CLASS: Record<SeloTom, string> = {
  verde: "bg-success/15 text-success border-success/30",
  ambar: "bg-warning/15 text-warning border-warning/30",
  vermelho: "bg-destructive/15 text-destructive border-destructive/30",
  neutro: "bg-muted text-muted-foreground border-border",
};

export function Selo({ texto, tom, tooltip }: { texto: string; tom: SeloTom; tooltip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none whitespace-nowrap ${TOM_CLASS[tom]}`}
        >
          {texto}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/** Badge de lastro de entrega — domínio novo da vw_cobranca_mesa. */
export function seloEntrega(l: LinhaMesa) {
  switch (l.lastro_entrega) {
    case "confirmada":
      return (
        <Selo
          texto="Entrega confirmada"
          tom="verde"
          tooltip={`Entrega confirmada pelo transportador${l.entrega_data ? ` em ${fmtDataMesa(l.entrega_data)}` : l.entregue_em ? ` em ${fmtDataHoraMesa(l.entregue_em)}` : ""}${l.entrega_recebedor ? ` — recebido por: ${l.entrega_recebedor}` : ""}`}
        />
      );
    case "devolvida":
      return (
        <Selo
          texto="MERCADORIA DEVOLVIDA"
          tom="vermelho"
          tooltip={`Mercadoria devolvida${l.entrega_ocorrencia_texto ? ` — ${l.entrega_ocorrencia_texto}` : ""}`}
        />
      );
    case "problema":
      return (
        <Selo
          texto="Problema na entrega"
          tom="vermelho"
          tooltip={`Ocorrência na entrega${l.entrega_ocorrencia_texto ? ` — ${l.entrega_ocorrencia_texto}` : ""}`}
        />
      );
    case "em_transito":
      return (
        <Selo
          texto="Em trânsito"
          tom="ambar"
          tooltip={`Mercadoria em trânsito${l.entrega_previsao ? ` — previsão ${fmtDataMesa(l.entrega_previsao)}` : ""}`}
        />
      );
    case "sem_rastreio":
      return <Selo texto="Sem rastreio" tom="neutro" tooltip="Não há rastreio registrado para esta entrega" />;
    case "sem_prova":
      return <Selo texto="Entregue sem prova" tom="ambar" tooltip="Entrega sem prova formal registrada" />;
    default:
      return (
        <Selo
          texto={l.lastro_entrega ?? "—"}
          tom="neutro"
          tooltip={`Lastro de entrega: ${l.lastro_entrega ?? "não informado"}`}
        />
      );
  }
}

export function seloInstrumento(l: LinhaMesa) {
  switch (l.lastro_instrumento) {
    case "pagavel":
      return <Selo texto="Boleto pagável" tom="verde" tooltip={`Boleto pagável${l.boleto_status ? ` (${l.boleto_status})` : ""}`} />;
    case "inexistente":
      return <Selo texto="Sem boleto" tom="vermelho" tooltip="Cliente não tem instrumento de pagamento — nada a pagar" />;
    case "exige_reemissao":
      return <Selo texto="Reemitir" tom="ambar" tooltip="Boleto exige reemissão antes de cobrar" />;
    case "em_processo":
      return <Selo texto="No banco" tom="neutro" tooltip="Instrumento em processamento no banco" />;
    case "nao_aplicavel":
      return <Selo texto={l.instrumento ?? "não aplicável"} tom="neutro" tooltip={`Instrumento: ${l.instrumento ?? "não aplicável"}`} />;
    default:
      return <Selo texto={l.lastro_instrumento ?? "—"} tom="neutro" tooltip={`Lastro de instrumento: ${l.lastro_instrumento ?? "não informado"}`} />;
  }
}

/** Badge de lastro de envio — a falha é do nosso lado, nunca "e-mail inválido do cliente". */
export function seloEnvio(l: LinhaMesa) {
  switch (l.lastro_envio) {
    case "aceito_provedor":
      return (
        <Selo
          texto="Envio aceito pelo provedor"
          tom="verde"
          tooltip={`${AVISO_PROVA_ENVIO}${l.pacote_enviado_em ? ` Envio em ${fmtDataHoraMesa(l.pacote_enviado_em)}.` : ""}`}
        />
      );
    case "sem_registro":
      return <Selo texto="Nenhum envio registrado" tom="neutro" tooltip="Nenhum envio de pacote foi registrado para este título." />;
    case "envio_com_falha":
      return (
        <Selo
          texto={l.envio_falhou_em ? `Último envio falhou · falhou em ${fmtDataMesa(l.envio_falhou_em)}` : "Último envio falhou"}
          tom="vermelho"
          tooltip={
            (l.envio_falha_motivo ? `${l.envio_falha_motivo}. ` : "") +
            "A falha ocorreu no nosso envio — não indica que o e-mail do cliente seja inválido. " +
            AVISO_PROVA_ENVIO
          }
        />
      );
    case "bloqueado":
      return <Selo texto="E-mail em supressão" tom="vermelho" tooltip="Endereço em supressão no provedor — é preciso liberar antes de reenviar." />;
    case "sem_email":
      return <Selo texto="Cliente sem e-mail cadastrado" tom="vermelho" tooltip="Não há e-mail cadastrado para este cliente." />;
    default:
      return <Selo texto={l.lastro_envio ?? "—"} tom="neutro" tooltip={`Lastro de envio: ${l.lastro_envio ?? "não informado"}`} />;
  }
}

/** "BRASPRESS · 001 Entrega realizada · 23/07/2026" — só o que não é nulo. */
export function resumoEntrega(l: LinhaMesa): string {
  const partes: string[] = [];
  if (l.entrega_transportadora) partes.push(l.entrega_transportadora);
  const ocor = [l.entrega_ocorrencia_codigo, l.entrega_ocorrencia_texto].filter(Boolean).join(" ");
  if (ocor) partes.push(ocor);
  if (l.entrega_data) partes.push(fmtDataMesa(l.entrega_data));
  else if (l.entrega_previsao) partes.push(`previsão ${fmtDataMesa(l.entrega_previsao)}`);
  if (l.entrega_recebedor) partes.push(`recebido por: ${l.entrega_recebedor}`);
  return partes.join(" · ");
}

/** "enviado em dd/MM/yyyy HH:mm" ou "nunca enviado". */
export function textoUltimoEnvio(l: LinhaMesa): string {
  return l.pacote_enviado_em ? `enviado em ${fmtDataHoraMesa(l.pacote_enviado_em)}` : "nunca enviado";
}

/** Linha compacta de entrega + envio, para colar junto às ressalvas. */
export function EntregaResumoInline({ l, className }: { l: LinhaMesa; className?: string }) {
  const resumo = resumoEntrega(l);
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground ${className ?? ""}`}>
      {resumo && <span>{resumo}</span>}
      {/* Histórico neutro: houve devolução num embarque anterior e a mercadoria
          seguiu em outro. O estado atual já está no badge principal. */}
      {l.entrega_reembarcada && (
        <span className="rounded border border-border bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
          reembarcada após devolução
        </span>
      )}
      <span>{textoUltimoEnvio(l)}</span>
    </span>
  );
}
