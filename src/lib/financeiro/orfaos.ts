import type { OrfaoEntrada } from "@/hooks/financeiro/useConciliacaoOrfaos";

export function motivoOrfaoValido(classe: string, motivo: string) {
  return classe.length > 0 && motivo.trim().length >= 5;
}

export function filtrarOrfaos(linhas: OrfaoEntrada[], busca: string, conta: string) {
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const numero = termo.replace(/[^\d]/g, "");
  return linhas.filter(o => {
    if (conta !== "todas" && o.conta !== conta) return false;
    if (!termo) return true;
    return (o.contraparte_nome ?? "").toLocaleLowerCase("pt-BR").includes(termo)
      || (!!numero && (o.contraparte_documento ?? "").replace(/\D/g, "").includes(numero))
      || [String(o.valor), Number(o.valor).toFixed(2).replace(".", ","), Number(o.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })]
        .some(v => v.includes(termo.replace(/^r\$\s*/, "")));
  });
}