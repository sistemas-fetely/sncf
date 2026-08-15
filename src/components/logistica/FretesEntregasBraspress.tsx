import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, Truck } from "lucide-react";
import { useEntregasTransportadora } from "@/hooks/logistica/useEntregasTransportadora";
import { TabelaEntregas } from "./TabelaEntregas";
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

  const kpiData: Array<{ key: Filtro; label: string; value: number; cls: string }> = [
    { key: "entregue", label: "Entregues", value: kpis.entregues, cls: "border-success/40 hover:bg-success/5" },
    { key: "em_transito", label: "Em trânsito", value: kpis.transito, cls: "border-info/40 hover:bg-info/5" },
    {
      key: "atencao",
      label: "Atenção",
      value: kpis.atencao,
      cls: kpis.atencao > 0
        ? "border-destructive bg-destructive/10 text-destructive hover:bg-destructive/15"
        : "border-destructive/40 hover:bg-destructive/5",
    },
    { key: "sem_conhecimento", label: "Sem conhecimento", value: kpis.semConhecimento, cls: "border-warning/40 hover:bg-warning/5" },
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
              "rounded-lg border bg-card p-3 text-left transition",
              k.cls,
              filtro === k.key && "ring-2 ring-primary"
            )}
          >
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className="text-2xl font-semibold tabular-nums">{k.value}</div>
          </button>
        ))}
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">Frete total</div>
          <div className="text-2xl font-semibold tabular-nums">{BRL.format(kpis.total)}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por destinatário, NF ou CT-e…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-8"
          />
        </div>
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
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando entregas…
        </div>
      ) : entregas.length === 0 ? (
        <div className="border rounded-lg p-10 text-center space-y-3">
          <Truck className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nenhuma entrega registrada ainda para a {transportadoraNome}.
          </p>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="border rounded-lg p-10 text-center text-sm text-muted-foreground">
          Nenhuma entrega corresponde ao filtro.
        </div>
      ) : (
        <TabelaEntregas entregas={filtrados} />
      )}
    </div>
  );
}
