import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listarRepresentantesDoLote } from "./loteRepresentantes";
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
    queryFn: () => listarRepresentantesDoLote(competencia),
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
