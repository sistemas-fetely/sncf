import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Ban, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * FONTE-UNICA-DO-BOLETO (02/09/2026)
 *
 * Durante a janela de reemissao (REEMISSAO-NAO-ESPERA-BAIXA) um titulo pode ter
 * DOIS boletos vivos no Safra: o novo, que o cliente deve pagar, e o antigo, que
 * esta em processo de baixa. As colunas de `titulo_a_receber` descrevem o ANTIGO
 * de proposito — e a chave que o retorno da baixa usa. Quem fala com o cliente
 * tem de ler `vw_titulo_boleto_vigente`.
 *
 * Este componente existe porque em 01/09 (NEW FESTA) um cliente ficou com 4
 * boletos vivos para 2 parcelas e ninguem viu na tela.
 */

export interface BoletoVigente {
  titulo_id: string;
  enviavel: boolean;
  nosso_numero: string | null;
  linha_digitavel: string | null;
  data_vencimento: string | null;
  valor: number | null;
  situacao: string | null;
  vigente_em_baixa: boolean;
  boletos_vivos: number;
  nosso_numero_em_baixa: string | null;
}

export function useBoletoVigente(tituloId: string | null | undefined) {
  return useQuery({
    queryKey: ["boleto-vigente", tituloId],
    queryFn: async (): Promise<BoletoVigente | null> => {
      const { data, error } = await (supabase as any)
        .from("vw_titulo_boleto_vigente")
        .select(
          "titulo_id, enviavel, nosso_numero, linha_digitavel, data_vencimento, valor, situacao, vigente_em_baixa, boletos_vivos, nosso_numero_em_baixa",
        )
        .eq("titulo_id", tituloId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as BoletoVigente | null) ?? null;
    },
    enabled: !!tituloId,
  });
}

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

/**
 * Avisa quando o titulo tem mais de um boleto vivo, ou quando o unico vivo
 * esta em baixa. Nao renderiza nada no caso normal — aviso que aparece sempre
 * vira ruido e para de ser lido.
 */
export function AvisoBoletosVivos({ tituloId }: { tituloId: string }) {
  const { data: bv } = useBoletoVigente(tituloId);
  if (!bv) return null;

  if (bv.vigente_em_baixa) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        <Ban className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Não envie este boleto ao cliente.</p>
          <p className="mt-0.5">
            O único boleto vivo ({bv.nosso_numero}) está em processo de baixa no banco. Gere a
            remessa de entrada da reemissão para que o boleto novo exista.
          </p>
        </div>
      </div>
    );
  }

  if (bv.boletos_vivos > 1) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-warning" />
        <div>
          <p className="font-medium text-foreground">
            Dois boletos vivos — envie apenas o novo.
          </p>
          <p className="mt-0.5 text-muted-foreground">
            Vigente: <span className="font-mono">{bv.nosso_numero}</span>, vence{" "}
            {fmtData(bv.data_vencimento)}. Em baixa:{" "}
            <span className="font-mono">{bv.nosso_numero_em_baixa ?? "—"}</span> — o cliente ainda
            consegue pagá-lo até o banco confirmar a baixa.
          </p>
        </div>
      </div>
    );
  }

  return null;
}

/**
 * Nosso numero e linha digitavel do boleto VIGENTE. Substitui a leitura das
 * colunas do titulo, que na janela de reemissao apontam para o boleto em baixa.
 * `onCopiar` fica por conta da tela — cada uma tem seu proprio toast.
 */
export function BoletoVigenteLinhas({
  tituloId,
  fallbackNossoNumero,
  onCopiar,
}: {
  tituloId: string;
  fallbackNossoNumero?: string | null;
  onCopiar?: (texto: string) => void;
}) {
  const { data: bv, isLoading } = useBoletoVigente(tituloId);

  const nossoNumero = bv?.nosso_numero ?? (isLoading ? null : fallbackNossoNumero ?? null);
  // Nunca oferecer para copiar a linha de um boleto que nao deve ir ao cliente.
  const linha = bv && bv.enviavel ? bv.linha_digitavel : null;

  return (
    <>
      <div className="text-xs">
        <span className="text-muted-foreground">Nosso número: </span>
        <span className="font-mono">{nossoNumero ?? "—"}</span>
        {bv && bv.boletos_vivos > 1 && (
          <span className="text-muted-foreground"> (vigente)</span>
        )}
      </div>
      {linha && (
        <div className="flex items-center gap-2">
          <code className="text-[11px] break-all bg-muted px-2 py-1 rounded flex-1">{linha}</code>
          {onCopiar && (
            <button
              type="button"
              className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted"
              onClick={() => onCopiar(linha)}
              aria-label="Copiar linha digitável"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </>
  );
}

export default AvisoBoletosVivos;
