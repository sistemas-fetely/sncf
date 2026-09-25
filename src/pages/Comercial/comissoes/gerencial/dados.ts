import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { lerTudo, type Linha } from "@/pages/Comercial/representantes/dados";
import { fmtBRL } from "../fmt";

export const RE_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

export function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Mês anterior ao corrente, em AAAA-MM. */
export function competenciaPadrao(): string {
  const hoje = new Date();
  const d = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function primeiroDia(competencia: string): string {
  return `${competencia}-01`;
}

export function proximoMes(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** Janela de 6 competências terminando na selecionada (inclusive). */
function inicioJanela(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 6, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export interface LinhaRepresentante {
  vendedorId: string;
  representante: string;
  notas: number;
  baseFaturada: number;
  descontoMedioPct: number | null;
  pctEfetivo: number | null;
  comissaoApurada: number;
  comissaoLiberada: number;
  aPagar: number;
  clientesNovos: number;
}

export interface Gerencial {
  carregando: boolean;
  erro: unknown;
  /** Linha da competência na view gerencial (pode não existir). */
  mes: Linha | null;
  /** Até 6 competências, da mais antiga para a mais nova. */
  historico: Linha[];
  representantes: LinhaRepresentante[];
  atencao: string[];
  travadaInadimplencia: number;
  carteiraVencida: number;
  semMovimento: boolean;
}

export function useGerencial(competencia: string): Gerencial {
  const valida = RE_COMPETENCIA.test(competencia);
  const inicio = valida ? primeiroDia(competencia) : "";
  const fim = valida ? proximoMes(competencia) : "";
  const janela = valida ? inicioJanela(competencia) : "";

  const gerencialQ = useQuery({
    queryKey: ["comissao-gerencial", competencia],
    queryFn: () =>
      lerTudo(
        "vw_comissao_gerencial_mensal",
        (q) => q.gte("competencia", janela).lte("competencia", inicio),
        { col: "competencia", asc: true },
      ),
    enabled: valida,
  });

  const repFinQ = useQuery({
    queryKey: ["comissao-gerencial-representantes"],
    queryFn: () => lerTudo("vw_representante_financeiro"),
    enabled: valida,
  });

  const detalheQ = useQuery({
    queryKey: ["comissao-gerencial-detalhe", competencia],
    queryFn: () =>
      lerTudo("vw_comissao_detalhe", (q) => q.gte("competencia", inicio).lt("competencia", fim)),
    enabled: valida,
  });

  const extratoQ = useQuery({
    queryKey: ["comissao-gerencial-extrato", competencia],
    queryFn: () =>
      lerTudo("vw_comissao_extrato_mensal", (q) =>
        q.gte("competencia_pagamento", inicio).lt("competencia_pagamento", fim),
      ),
    enabled: valida,
  });

  const clientesNovosQ = useQuery({
    queryKey: ["comissao-gerencial-clientes-novos", competencia],
    queryFn: () =>
      lerTudo("vw_cliente_abertura", (q) => q.gte("mes_abertura", inicio).lt("mes_abertura", fim)),
    enabled: valida,
  });

  const historico = gerencialQ.data ?? [];
  const mes = useMemo(
    () => historico.find((l) => String(l.competencia ?? "").slice(0, 7) === competencia) ?? null,
    [historico, competencia],
  );

  const representantes = useMemo<LinhaRepresentante[]>(() => {
    const clientesNovosPorVendedor = new Map<string, number>();
    for (const l of clientesNovosQ.data ?? []) {
      const id = String(l.vendedor_abertura_id ?? "");
      if (id) clientesNovosPorVendedor.set(id, (clientesNovosPorVendedor.get(id) ?? 0) + 1);
    }
    const aPagarPorVendedor = new Map<string, number>();
    for (const l of extratoQ.data ?? []) {
      const id = String(l.vendedor_id ?? "");
      aPagarPorVendedor.set(id, (aPagarPorVendedor.get(id) ?? 0) + num(l.valor_a_pagar));
    }

    interface Acc {
      representante: string;
      notas: Set<string>;
      base: number;
      descontoPonderado: number;
      comissaoApurada: number;
      comissaoLiberada: number;
    }
    const mapa = new Map<string, Acc>();
    const notasVistas = new Set<string>();

    for (const l of detalheQ.data ?? []) {
      const id = String(l.vendedor_id ?? "");
      if (!id) continue;
      const acc = mapa.get(id) ?? {
        representante: String(l.representante ?? "Sem nome"),
        notas: new Set<string>(),
        base: 0,
        descontoPonderado: 0,
        comissaoApurada: 0,
        comissaoLiberada: 0,
      };
      // Valores por nota só entram uma vez (a view repete a nota em cada parcela).
      const chaveNota = `${id}|${String(l.nf_id ?? l.nf ?? l.apuracao_id ?? "")}`;
      if (!notasVistas.has(chaveNota)) {
        notasVistas.add(chaveNota);
        acc.notas.add(chaveNota);
        const base = num(l.base_comissionavel);
        acc.base += base;
        acc.descontoPonderado += num(l.desconto_pct) * base;
        acc.comissaoApurada += num(l.comissao_da_nota);
      }
      acc.comissaoLiberada += num(l.valor_liberado);
      mapa.set(id, acc);
    }

    return [...mapa.entries()]
      .map(([vendedorId, acc]) => ({
        vendedorId,
        representante: acc.representante,
        notas: acc.notas.size,
        baseFaturada: acc.base,
        descontoMedioPct: acc.base > 0 ? acc.descontoPonderado / acc.base : null,
        pctEfetivo: acc.base > 0 ? (acc.comissaoApurada / acc.base) * 100 : null,
        comissaoApurada: acc.comissaoApurada,
        comissaoLiberada: acc.comissaoLiberada,
        aPagar: aPagarPorVendedor.get(vendedorId) ?? 0,
        clientesNovos: clientesNovosPorVendedor.get(vendedorId) ?? 0,
      }))
      .sort((a, b) => b.comissaoApurada - a.comissaoApurada);
  }, [clientesNovosQ.data, detalheQ.data, extratoQ.data]);

  const reps = repFinQ.data ?? [];
  const semContraparte = reps.filter((r) => r.bloqueio_pagamento === true && num(r.comissao_a_receber) > 0);
  const valorSemContraparte = semContraparte.reduce((s, r) => s + num(r.comissao_a_receber), 0);
  const travadaInadimplencia = reps.reduce((s, r) => s + num(r.comissao_travada_inadimplencia), 0);
  const carteiraVencida = reps.reduce((s, r) => s + num(r.carteira_vencida), 0);

  const atencao = useMemo(() => {
    const itens: string[] = [];
    if (!mes) return itens;
    const plural = (n: number, um: string, muitos: string) => (n === 1 ? um : muitos);

    const aguardando = num(mes.notas_aguardando_diretoria);
    if (aguardando > 0)
      itens.push(`${aguardando} ${plural(aguardando, "nota aguarda", "notas aguardam")} decisão da diretoria.`);

    const bloqueadas = num(mes.notas_bloqueadas);
    if (bloqueadas > 0)
      itens.push(`${bloqueadas} ${plural(bloqueadas, "nota bloqueada", "notas bloqueadas")} na apuração.`);

    const estornos = num(mes.estornos);
    if (estornos > 0)
      itens.push(
        `${estornos} ${plural(estornos, "estorno", "estornos")} no mês, somando ${fmtBRL(num(mes.valor_estornado))}.`,
      );

    const contestacoes = num(mes.contestacoes);
    if (contestacoes > 0)
      itens.push(
        `${contestacoes} ${plural(contestacoes, "contestação aberta", "contestações abertas")} no mês, ${num(mes.contestacoes_procedentes)} ${plural(num(mes.contestacoes_procedentes), "procedente", "procedentes")}.`,
      );

    if (semContraparte.length > 0)
      itens.push(
        `${semContraparte.length} ${plural(semContraparte.length, "representante tem", "representantes têm")} comissão a receber mas não ${plural(semContraparte.length, "pode", "podem")} ser ${plural(semContraparte.length, "pago", "pagos")} por falta de cadastro de contraparte (${fmtBRL(valorSemContraparte)}).`,
      );

    const semTitulo = num(mes.extratos_fechados) - num(mes.extratos_com_titulo);
    if (semTitulo > 0)
      itens.push(`${semTitulo} ${plural(semTitulo, "extrato fechado", "extratos fechados")} sem título gerado.`);

    const naoEnviados = num(mes.extratos_fechados) - num(mes.extratos_enviados);
    if (naoEnviados > 0)
      itens.push(
        `${naoEnviados} ${plural(naoEnviados, "extrato fechado não foi enviado", "extratos fechados não foram enviados")} ao representante.`,
      );

    return itens;
  }, [mes, semContraparte.length, valorSemContraparte]);

  const carregando = gerencialQ.isLoading || repFinQ.isLoading || detalheQ.isLoading || extratoQ.isLoading || clientesNovosQ.isLoading;
  const erro = gerencialQ.error || repFinQ.error || detalheQ.error || extratoQ.error || clientesNovosQ.error;
  const semMovimento =
    !carregando && !erro && (!mes || (num(mes.notas) === 0 && num(mes.comissao_apurada) === 0)) && representantes.length === 0;

  return {
    carregando,
    erro,
    mes,
    historico,
    representantes,
    atencao,
    travadaInadimplencia,
    carteiraVencida,
    semMovimento,
  };
}
