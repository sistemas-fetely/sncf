// DEV-TRS-AUTO (03/11/2026): leitura da situação da TRS de retorno (vw_devolucao_trs_retorno).
// A situação é decidida no banco; aqui só se escolhe o texto e o tom da linha da Eva.
export type SituacaoTrsRetorno =
  | "sem_trs" | "erro_criacao" | "aguardando_natureza" | "aguardando_envio"
  | "erro_envio" | "no_bling" | "rascunho" | "autorizada";

export type TrsRetorno = {
  id: string; trs_numero: string | null; situacao: SituacaoTrsRetorno;
  nf_numero: string | null; erro: string | null;
};

export type LinhaTrs = { texto: string; tom: "ok" | "aviso" | "erro"; podeTentar: boolean };

export function linhaTrsRetorno(t: TrsRetorno): LinhaTrs {
  const trs = t.trs_numero ?? "TRS";
  switch (t.situacao) {
    case "autorizada": return { texto: `${trs} · NF nº ${t.nf_numero ?? "?"} autorizada ✓`, tom: "ok", podeTentar: false };
    case "aguardando_natureza": return { texto: `${trs} · Aguardando natureza fiscal da transferência (CFOP) — Eva`, tom: "aviso", podeTentar: false };
    case "rascunho": return { texto: `${trs} · Rascunho NF nº ${t.nf_numero ?? "?"} — Eva: transmitir no Bling`, tom: "aviso", podeTentar: false };
    case "no_bling": return { texto: `${trs} · No Bling — Eva: emitir e transmitir a NF`, tom: "aviso", podeTentar: false };
    case "aguardando_envio": return { texto: `${trs} · Enviando ao Bling na próxima rodada`, tom: "aviso", podeTentar: false };
    case "erro_envio": return { texto: `${trs} · Erro no envio ao Bling: ${t.erro ?? "sem detalhe"}`, tom: "erro", podeTentar: false };
    case "erro_criacao": return { texto: `Transferência automática falhou: ${t.erro ?? "sem detalhe"}`, tom: "erro", podeTentar: true };
    case "sem_trs": return { texto: "Transferência automática ainda não criada", tom: "aviso", podeTentar: true };
  }
}
