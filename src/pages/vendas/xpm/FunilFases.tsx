import { Fragment, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight } from "lucide-react";

export type FunilFase = {
  sequencia: number;
  codigo: string;
  descricao: string;
  parados_aqui: number;
  ja_passaram: number;
  em_alerta: number;
  volumes_parados: number;
};

type ExpedicaoResumo = {
  estagio_seq: number;
  fase_seq: number;
  quantidade_volumes: number | null;
  farol: "concluida" | "pausada" | "risco" | "atencao" | "no_prazo" | null;
};

const FASES: Pick<FunilFase, "sequencia" | "codigo" | "descricao">[] = [
  { sequencia: 1, codigo: "SOLICITADO", descricao: "Solicitado" },
  { sequencia: 2, codigo: "SEPARADO", descricao: "Separado" },
  { sequencia: 3, codigo: "CONFERIDO", descricao: "Conferido" },
  { sequencia: 4, codigo: "NOTAFISCAL", descricao: "Nota Fiscal" },
  { sequencia: 5, codigo: "EMBARCADO", descricao: "Embarcado" },
  { sequencia: 6, codigo: "EXPEDIDO", descricao: "Expedido" },
];

const nfInt = new Intl.NumberFormat("pt-BR");

export default function FunilFases({
  estagioAtivo,
  onSelecionar,
}: {
  estagioAtivo?: string | null;
  onSelecionar?: (codigo: string) => void;
}) {
  const expedicoesQ = useQuery({
    queryKey: ["xpm-funil-fases"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_xpm_risco_atraso")
        .select("estagio_seq, fase_seq, quantidade_volumes, farol");
      if (error) throw error;
      return (data ?? []) as ExpedicaoResumo[];
    },
  });

  if (expedicoesQ.isError) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6 text-sm text-destructive">
          {(expedicoesQ.error as Error)?.message ?? "Erro ao carregar o funil de fases"}
        </CardContent>
      </Card>
    );
  }

  if (expedicoesQ.isLoading) return <Skeleton className="h-28 w-full" />;

  const rows = expedicoesQ.data ?? [];

  const fases = useMemo<FunilFase[]>(() => {
    return FASES.map((f) => {
      const parados = rows.filter((r) => Number(r.fase_seq) === f.sequencia);
      return {
        ...f,
        parados_aqui: parados.length,
        ja_passaram: rows.filter((r) => Number(r.fase_seq) >= f.sequencia).length,
        em_alerta: parados.filter(
          (r) => r.farol === "atencao" || r.farol === "risco"
        ).length,
        volumes_parados: parados.reduce(
          (s, r) => s + Number(r.quantidade_volumes ?? 0),
          0
        ),
      };
    });
  }, [rows]);

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-stretch gap-1 overflow-x-auto">
          {fases.map((f, i) => {
            const parados = Number(f.parados_aqui ?? 0);
            const ativo = estagioAtivo === f.codigo;
            const clicavel = !!onSelecionar && parados > 0;
            return (
              <Fragment key={f.codigo}>
                {i > 0 && (
                  <ChevronRight className="h-4 w-4 shrink-0 self-center text-muted-foreground/50" />
                )}
                <button
                  type="button"
                  disabled={!clicavel}
                  onClick={clicavel ? () => onSelecionar!(f.codigo) : undefined}
                  className={`relative shrink-0 min-w-[120px] flex-1 rounded-md border px-3 py-2 text-left transition-colors ${
                    ativo
                      ? "bg-primary/20 border-primary"
                      : parados > 0
                        ? "bg-primary/10 border-primary/30"
                        : "bg-background border-border"
                  } ${clicavel ? "cursor-pointer" : "cursor-default"}`}
                >
                  {Number(f.em_alerta ?? 0) > 0 && (
                    <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-warning" />
                  )}
                  <div className="text-[12px] font-medium">{f.descricao}</div>
                  <div className="text-2xl font-medium tabular-nums leading-tight">
                    {parados === 0 ? "—" : nfInt.format(parados)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {nfInt.format(Number(f.ja_passaram ?? 0))} passaram
                  </div>
                </button>
              </Fragment>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Fase mais avançada entre a API da XPM e o relatório do armazém. Cinza = etapa iniciada e
          ainda não concluída.
        </p>
      </CardContent>
    </Card>
  );
}
