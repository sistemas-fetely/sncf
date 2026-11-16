import { paraDataISO } from "@/lib/data";

export interface EventoTransferencia {
  tipo_evento: string;
  estagio_novo: string | null;
  metadata: unknown;
  criado_em: string;
}

export function montarTimelineTransferencia(eventos: EventoTransferencia[], nf: string | null, conferencia: string | null, agora = new Date()) {
  const mudancas = eventos.filter((e) => e.tipo_evento === "mudou_estagio").map((e) => {
    const meta = e.metadata;
    const para = typeof meta === "object" && meta !== null && "para" in meta && typeof meta.para === "string" ? meta.para : e.estagio_novo;
    return { para, data: e.criado_em };
  }).sort((a, b) => a.data.localeCompare(b.data));
  const dataEstagio = (estagios: string[]) => mudancas.find((e) => estagios.includes(e.para ?? ""))?.data ?? null;
  const datas = [dataEstagio(["recebido"]), dataEstagio(["em_separacao"]), nf, dataEstagio(["em_transporte", "em_transito", "excecao_transporte"]), dataEstagio(["entregue"]), conferencia];
  let atual = 0;
  datas.forEach((data, i) => { if (data) atual = i; });
  const inicio = paraDataISO(datas[atual]);
  const hoje = paraDataISO(agora);
  const dias = inicio && hoje ? Math.max(0, Math.round((Date.parse(hoje) - Date.parse(inicio)) / 86400000)) : null;
  return { datas, atual, dias };
}