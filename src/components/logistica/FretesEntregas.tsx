import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Upload, Loader2, Search, Truck } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFretesTransportadora } from "@/hooks/logistica/useFretesTransportadora";
import { CardFrete } from "./CardFrete";
import { TabelaFretes } from "./TabelaFretes";
import { ImportarFretesDialog } from "./ImportarFretesDialog";
import { cn } from "@/lib/utils";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Filtro = "todos" | "entregue" | "em_transito" | "atencao";

interface Props {
  transportadoraId: string;
  transportadoraNome: string;
}

export function FretesEntregas({ transportadoraId, transportadoraNome }: Props) {
  const { data: fretes = [], isLoading } = useFretesTransportadora(transportadoraId);
  const [importando, setImportando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const mobile = useIsMobile();

  const kpis = useMemo(() => {
    let entregues = 0, transito = 0, atencao = 0, total = 0;
    for (const f of fretes) {
      if (f.classe === "entregue") entregues++;
      if (f.classe === "em_transito" || f.classe === "coletado") transito++;
      if (f.eh_problema) atencao++;
      total += Number(f.frete_total ?? 0);
    }
    return { entregues, transito, atencao, total };
  }, [fretes]);

  const ultimoImport = useMemo(() => {
    let maior = "";
    for (const f of fretes) {
      if (f.importado_em && f.importado_em > maior) maior = f.importado_em;
    }
    if (!maior) return null;
    const d = new Date(maior);
    return isNaN(d.getTime()) ? null
      : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }, [fretes]);

  const filtrados = useMemo(() => {
    const buscaLower = busca.trim().toLowerCase();
    return fretes.filter((f) => {
      if (filtro === "entregue" && f.classe !== "entregue") return false;
      if (filtro === "em_transito" && f.classe !== "em_transito" && f.classe !== "coletado") return false;
      if (filtro === "atencao" && !f.eh_problema) return false;
      if (buscaLower) {
        const alvo = `${f.destinatario ?? ""} ${f.nf_numero ?? ""}`.toLowerCase();
        if (!alvo.includes(buscaLower)) return false;
      }
      return true;
    });
  }, [fretes, filtro, busca]);

  function toggleFiltro(novo: Filtro) {
    setFiltro((atual) => (atual === novo ? "todos" : novo));
  }

  const kpiData: Array<{ key: Filtro; label: string; value: string; cls: string }> = [
    { key: "entregue", label: "Entregues", value: String(kpis.entregues), cls: "border-success/40 hover:bg-success/5" },
    { key: "em_transito", label: "Em trânsito", value: String(kpis.transito), cls: "border-info/40 hover:bg-info/5" },
    { key: "atencao", label: "Atenção", value: String(kpis.atencao), cls: "border-destructive/40 hover:bg-destructive/5" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button onClick={() => setImportando(true)} className="gap-2">
            <Upload className="h-4 w-4" /> Importar planilha
          </Button>
          {ultimoImport && (
            <span className="text-xs text-muted-foreground">atualizado {ultimoImport}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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
            placeholder="Buscar por destinatário ou NF…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="entregue">Entregues</SelectItem>
            <SelectItem value="em_transito">Em trânsito</SelectItem>
            <SelectItem value="atencao">Atenção</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando fretes…
        </div>
      ) : fretes.length === 0 ? (
        <div className="border rounded-lg p-10 text-center space-y-3">
          <Truck className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nenhum frete importado ainda. Importe a planilha da {transportadoraNome}.
          </p>
          <Button onClick={() => setImportando(true)} className="gap-2">
            <Upload className="h-4 w-4" /> Importar planilha
          </Button>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="border rounded-lg p-10 text-center text-sm text-muted-foreground">
          Nenhum frete corresponde ao filtro.
        </div>
      ) : mobile ? (
        <div className="grid gap-2">
          {filtrados.map((f) => <CardFrete key={f.id} frete={f} />)}
        </div>
      ) : (
        <TabelaFretes fretes={filtrados} />
      )}

      {importando && (
        <ImportarFretesDialog
          open={importando}
          onOpenChange={setImportando}
          transportadoraId={transportadoraId}
          transportadoraNome={transportadoraNome}
        />
      )}
    </div>
  );
}
