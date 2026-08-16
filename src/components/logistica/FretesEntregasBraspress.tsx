import { useMemo, useState } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useEntregasTransportadora } from "@/hooks/logistica/useEntregasTransportadora";
import { TabelaEntregas } from "./TabelaEntregas";
import { TabelaFetely } from "@/components/ui/tabela-fetely";
import { cn } from "@/lib/utils";


const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Filtro = "todos" | "entregue" | "em_transito" | "atencao" | "sem_conhecimento";

interface Props {
  transportadoraId: string;
  transportadoraNome: string;
}

export function FretesEntregasBraspress({ transportadoraId, transportadoraNome }: Props) {
  const { data: entregas = [], isLoading } = useEntregasTransportadora(transportadoraId);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");

  const kpis = useMemo(() => {
    let entregues = 0, transito = 0, atencao = 0, semConhecimento = 0, total = 0;
    for (const e of entregas) {
      if (e.fase_entrega === "entregue") entregues++;
      else if (e.fase_entrega === "em_transito") transito++;
      else if (e.fase_entrega === "atencao") atencao++;
      else if (e.fase_entrega === "sem_conhecimento") semConhecimento++;
      total += Number(e.frete_total ?? 0);
    }
    return { entregues, transito, atencao, semConhecimento, total };
  }, [entregas]);

  const atualizacao = useMemo(() => {
    let maior = "";
    let api = 0;
    for (const e of entregas) {
      if (e.atualizado_em && e.atualizado_em > maior) maior = e.atualizado_em;
      if (e.origem_dado === "api") api++;
    }
    if (!maior) return null;
    const d = new Date(maior);
    if (isNaN(d.getTime())) return null;
    return {
      quando: d.toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
      }),
      viaApi: entregas.length > 0 && api > entregas.length / 2,
    };
  }, [entregas]);

  const filtrados = useMemo(() => {
    const buscaLower = busca.trim().toLowerCase();
    return entregas.filter((e) => {
      if (filtro !== "todos" && e.fase_entrega !== filtro) return false;
      if (buscaLower) {
        const alvo = `${e.destinatario ?? ""} ${e.nf_numero ?? ""} ${e.cte_numero ?? ""} ${e.pedido_ref ?? ""}`.toLowerCase();
        if (!alvo.includes(buscaLower)) return false;
      }
      return true;
    });
  }, [entregas, filtro, busca]);

  function toggleFiltro(novo: Filtro) {
    setFiltro((atual) => (atual === novo ? "todos" : novo));
  }

  const kpiData: Array<{ key: Filtro; label: string; value: number; alerta?: boolean }> = [
    { key: "entregue", label: "Entregues", value: kpis.entregues },
    { key: "em_transito", label: "Em trânsito", value: kpis.transito },
    { key: "atencao", label: "Atenção", value: kpis.atencao, alerta: kpis.atencao > 0 },
    { key: "sem_conhecimento", label: "Sem conhecimento", value: kpis.semConhecimento },
  ];

  return (
    <div className="space-y-4">
      {atualizacao && (
        <div className="text-xs text-muted-foreground">
          atualizado {atualizacao.quando}
          {atualizacao.viaApi && " · sincronizado pela API"}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {kpiData.map((k) => (
          <button
            key={k.key}
            onClick={() => toggleFiltro(k.key)}
            className={cn(
              "rounded-lg border bg-card p-3 text-left transition hover:bg-muted",
              k.alerta && "rounded-l-none border-l-[3px] border-l-destructive",
              filtro === k.key && "ring-2 ring-primary"
            )}
          >
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className={cn("text-2xl font-medium tabular-nums", k.alerta && "text-destructive")}>
              {k.value}
            </div>
          </button>
        ))}
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">Frete total</div>
          <div className="text-2xl font-medium tabular-nums">{BRL.format(kpis.total)}</div>
        </div>
      </div>

      <TabelaFetely
        busca={{
          valor: busca,
          aoMudar: setBusca,
          placeholder: "Buscar por destinatário, NF ou CT-e…",
        }}
        filtros={
          <Select value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="entregue">Entregues</SelectItem>
              <SelectItem value="em_transito">Em trânsito</SelectItem>
              <SelectItem value="atencao">Atenção</SelectItem>
              <SelectItem value="sem_conhecimento">Sem conhecimento</SelectItem>
            </SelectContent>
          </Select>
        }
        carregando={isLoading}
        vazio={{ mensagem: `Nenhuma entrega registrada ainda para a ${transportadoraNome}.` }}
        semResultado="Nenhuma entrega corresponde a esse filtro."
        total={entregas.length}
        exibidos={filtrados.length}
        rotulo="entregas"
      >
        <TabelaEntregas entregas={filtrados} />
      </TabelaFetely>
    </div>
  );
}
