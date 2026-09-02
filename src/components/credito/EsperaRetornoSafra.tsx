import { useQuery } from "@tanstack/react-query";
import { Clock, AlertTriangle, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * ESPERA-TEM-DE-SER-VISIVEL (02/09/2026)
 *
 * O selo do titulo dizia so "Baixa em remessa". Nao dizia o que estava esperando,
 * de quem, desde quando, nem o que se destrava quando chegasse. O operador entao
 * fazia a unica conta possivel — "gerei a baixa, o boleto nao apareceu, isso vai
 * levar dias" — e a leitura de "48 horas" nasceu dai, nao da lentidao do ciclo.
 *
 * A informacao ja existia em `vw_remessa_sem_retorno` desde 02/09 e nenhuma tela
 * a lia. Isto liga o dado ao selo.
 */

export interface EsperaRetorno {
  titulo_id: string;
  numero_titulo: string;
  boleto_status: string | null;
  arquivo_nome: string | null;
  remessa_tipo: string | null;
  remessa_status: string | null;
  enviada_em: string | null;
  dias_desde_envio: number | null;
  diagnostico: "nao_enviada" | "aguardando_normal" | "atrasada" | "sem_resposta" | null;
  ocorrencia_esperada: string | null;
  o_que_destrava: string | null;
  trava_e_nossa: boolean;
}

export function useEsperaRetorno(tituloId: string | null | undefined) {
  return useQuery({
    queryKey: ["espera-retorno", tituloId],
    queryFn: async (): Promise<EsperaRetorno | null> => {
      const { data, error } = await (supabase as any)
        .from("vw_titulo_espera_retorno")
        .select("*")
        .eq("titulo_id", tituloId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as EsperaRetorno | null) ?? null;
    },
    enabled: !!tituloId,
  });
}

function fmtQuando(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return mesmoDia ? `hoje ${hora}` : `${d.toLocaleDateString("pt-BR")} ${hora}`;
}

const TOM: Record<string, { classe: string; titulo: string }> = {
  nao_enviada: {
    classe: "border-warning/40 bg-warning/10",
    titulo: "O arquivo ainda não foi enviado ao Safra",
  },
  aguardando_normal: {
    classe: "border-info/40 bg-info/10",
    titulo: "Aguardando retorno do Safra",
  },
  atrasada: {
    classe: "border-warning/40 bg-warning/10",
    titulo: "Retorno do Safra atrasado",
  },
  sem_resposta: {
    classe: "border-destructive/40 bg-destructive/10",
    titulo: "Safra não respondeu",
  },
};

/**
 * Nao renderiza nada quando o titulo nao esta esperando ninguem — aviso que
 * aparece sempre vira ruido e para de ser lido.
 */
export function EsperaRetornoSafra({
  tituloId,
  compacto = false,
}: {
  tituloId: string;
  compacto?: boolean;
}) {
  const { data: e } = useEsperaRetorno(tituloId);
  if (!e || !e.diagnostico) return null;

  const tom = TOM[e.diagnostico] ?? TOM.aguardando_normal;
  const Icone = e.trava_e_nossa ? Upload : e.diagnostico === "aguardando_normal" ? Clock : AlertTriangle;

  // Na grade densa (Banco Safra) o bloco inteiro nao cabe: uma linha so, com o
  // essencial — o que espera e desde quando. O drawer mostra a versao completa.
  if (compacto) {
    const resumo = e.trava_e_nossa
      ? `${e.arquivo_nome} gerada e não enviada`
      : `Aguardando ${e.arquivo_nome} · ${
          e.dias_desde_envio === 0
            ? "hoje"
            : e.dias_desde_envio === 1
              ? "1 dia"
              : `${e.dias_desde_envio} dias`
        }`;
    const cor =
      e.diagnostico === "sem_resposta"
        ? "text-destructive"
        : e.diagnostico === "aguardando_normal"
          ? "text-muted-foreground"
          : "text-warning";
    return (
      <p className={`flex items-center gap-1 text-[10px] ${cor}`} title={e.o_que_destrava ?? undefined}>
        <Icone className="h-3 w-3 shrink-0" />
        <span className="truncate">{resumo}</span>
      </p>
    );
  }

  const desde =
    e.dias_desde_envio === null
      ? null
      : e.dias_desde_envio === 0
        ? "enviada hoje"
        : e.dias_desde_envio === 1
          ? "enviada ontem"
          : `enviada há ${e.dias_desde_envio} dias`;

  return (
    <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${tom.classe}`}>
      <Icone className="h-4 w-4 shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p className="font-medium text-foreground">{tom.titulo}</p>

        {e.trava_e_nossa ? (
          <p className="text-muted-foreground">
            <span className="font-mono">{e.arquivo_nome}</span> foi gerada e ainda não subiu no
            SafraNet. Enquanto não subir, nada avança — e a trava é nossa, não do banco.
          </p>
        ) : (
          <p className="text-muted-foreground">
            <span className="font-mono">{e.arquivo_nome}</span> {desde}
            {e.enviada_em ? ` (${fmtQuando(e.enviada_em)})` : ""}. Esperando a{" "}
            {e.ocorrencia_esperada}.
          </p>
        )}

        {e.o_que_destrava && <p className="text-muted-foreground">{e.o_que_destrava}</p>}

        {e.diagnostico === "atrasada" && (
          <p className="text-foreground">
            Passou do prazo normal de resposta. Conferir se o arquivo foi aceito no SafraNet.
          </p>
        )}
        {e.diagnostico === "sem_resposta" && (
          <p className="text-foreground">
            Sem resposta há {e.dias_desde_envio} dias. Acionar o Safra — o título está parado.
          </p>
        )}
      </div>
    </div>
  );
}

export default EsperaRetornoSafra;
