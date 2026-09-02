import { MessageSquare } from "lucide-react";
import { useHistoricoReguaTitulo } from "@/hooks/credito/useReguaFila";

/**
 * CONTEXTO-MORA-ONDE-SE-DECIDE (02/09/2026)
 *
 * A observacao de "Registrar acao" era gravada em `regua_cobranca_acoes_log.observacao`
 * e renderizada SO no drawer da aba Titulos, secao "Historico da regua". Para ler o
 * que ela mesma anotou, a operadora tinha que sair da regua, abrir outra tela e achar
 * o titulo. No card onde ela decide se liga de novo, nao aparecia nada.
 *
 * Caso que abriu isto: FESTAS E BALOES, TIT-2026-00342-03, 01/09 14h43, telefone —
 * "INFORMOU QUE VAI EFETUAR O PAGAMENTO AINDA ESSA SEMANA". Quem pegasse o card
 * depois ligaria de novo sem saber, e o cliente responderia que ja tinha avisado.
 *
 * Mostra apenas o ultimo contato COM texto. Acao sem observacao nao rende linha —
 * "enviada / e-mail / ontem" ja esta nos selos do card.
 */

function fmtQuando(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const dias = Math.floor((hoje.getTime() - d.getTime()) / 86_400_000);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (dias === 0) return `hoje ${hora}`;
  if (dias === 1) return `ontem ${hora}`;
  return `${d.toLocaleDateString("pt-BR")} ${hora}`;
}

const CANAL: Record<string, string> = {
  telefone: "por telefone",
  email: "por e-mail",
  whatsapp: "por WhatsApp",
  pix_manual: "PIX manual",
};

export function UltimoContatoRegua({ tituloId }: { tituloId: string }) {
  // Busca as ultimas 5 e pega a mais recente COM observacao — a acao mais nova
  // pode ser um e-mail automatico sem texto, e a anotacao humana e o que importa.
  const { data = [] } = useHistoricoReguaTitulo(tituloId, 5);
  const comTexto = data.find((h) => h.observacao && h.observacao.trim() !== "");
  if (!comTexto) return null;

  const canal = comTexto.canal_efetivo ? CANAL[comTexto.canal_efetivo] ?? comTexto.canal_efetivo : null;

  return (
    <div className="rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[11px]">
      <p className="flex items-center gap-1 text-muted-foreground">
        <MessageSquare className="h-3 w-3 shrink-0" />
        Último contato registrado {canal ? `${canal} ` : ""}· {fmtQuando(comTexto.executada_em)}
      </p>
      <p className="mt-0.5 text-foreground">{comTexto.observacao}</p>
    </div>
  );
}

export default UltimoContatoRegua;
