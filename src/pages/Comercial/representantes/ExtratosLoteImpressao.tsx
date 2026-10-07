import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { lerTudo } from "./dados";
import { representantesDoLote } from "./extratoMensal";
import { BarraImpressao } from "@/components/impressao/BarraImpressao";
import { formatError } from "@/lib/format-error";
import { fmtCompetencia } from "../comissoes/fmt";
import { EstilosExtrato, ExtratoRepresentanteDocumento } from "./ExtratoRepresentanteDocumento";

const RE_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Lote: todos os extratos de um mês de PAGAMENTO, um representante por folha. */
export default function ExtratosLoteImpressao() {
  const [params] = useSearchParams();
  const competencia = params.get("competencia") ?? "";
  const valida = RE_COMPETENCIA.test(competencia);
  const dia = `${competencia}-01`;

  const q = useQuery({
    queryKey: ["extratos-lote-representantes", competencia],
    enabled: valida,
    queryFn: async () => {
      const [ex, cart, comp] = await Promise.all([
        lerTudo("comissao_extrato", undefined, { col: "id" }, "id,vendedor_id,competencia,detalhe"),
        lerTudo("vw_comissao_detalhe", q => q.in("situacao_parcela", ["a_vencer", "vencida", "paga_aguarda_liberacao", "liberada"])),
        lerTudo("vw_comissao_complemento_pendente"),
      ]);
      const ids = representantesDoLote(ex, cart, comp, competencia);
      const nomes = new Map<string, string>();
      for (const id of ids) nomes.set(id, "");
      if (ids.length) {
        const representantes = await lerTudo("vw_representante_financeiro", q => q.in("vendedor_id", ids), undefined, "vendedor_id,representante");
        for (const l of representantes) nomes.set(l.vendedor_id, l.representante ?? "");
      }
      return [...nomes].map(([id, nome]) => ({ id, nome: nome || "Sem nome" }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
  });

  if (!valida) return <div className="flex min-h-screen items-center justify-center p-8 text-destructive-strong">Competência inválida. Use o formato AAAA-MM.</div>;
  if (q.isLoading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Preparando os extratos…</div>;
  if (q.error) return <div className="flex min-h-screen items-center justify-center p-8 text-destructive-strong">Falha ao listar os extratos: {formatError(q.error)}</div>;
  const lista = q.data ?? [];

  return (
    <main className="documento-extrato">
      <EstilosExtrato />
      <BarraImpressao />
      <p className="tela-apenas mx-auto mb-4 w-[210mm] max-w-full text-sm font-medium">
        Extratos de pagamento {fmtCompetencia(dia)} · {lista.length} {lista.length === 1 ? "representante" : "representantes"}
      </p>
      {lista.length === 0 ? (
        <p className="text-center text-muted-foreground">Nenhum extrato neste mês.</p>
      ) : lista.map((r, i) => (
        <div key={r.id} className={i > 0 ? "quebra-pagina" : undefined} data-representante={r.nome}>
          <ExtratoRepresentanteDocumento vendedorId={r.id} competencia={competencia} mostrarSeletor={false} />
        </div>
      ))}
    </main>
  );
}
