import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RefreshCw, Star, AlertTriangle, Users, Play } from "lucide-react";
import {
  useReguaEtapas,
  useReguaFilaHoje,
  useReguaPausados,
  resolverEtapaParaTitulo,
  type ReguaEtapa,
} from "@/hooks/credito/useReguaFila";
import { useTitulosCobranca } from "@/hooks/credito/useTitulosCobranca";
import type { TituloCobranca } from "@/hooks/credito/useTitulosCobranca";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format-currency";
import { formatCNPJ } from "@/lib/cnpj";
import { AcaoReguaDialog } from "@/components/credito/AcaoReguaDialog";
import { PausarReguaDialog } from "@/components/credito/PausarReguaDialog";
import { RenegociarTituloDialog } from "@/components/credito/RenegociarTituloDialog";

type Vista = "fila" | "pausados";

const CANAL_LABEL: Record<string, string> = {
  email: "E-mail",
  whatsapp: "WhatsApp",
  telefone: "Telefone",
  carta: "Carta",
  cartorio: "Cartório",
  advogado: "Advogado",
};

function KpiCard({
  label, valor, ativo, onClick, tone,
}: {
  label: string;
  valor: number;
  ativo: boolean;
  onClick: () => void;
  tone?: "default" | "danger" | "warn";
}) {
  const toneCls =
    tone === "danger"
      ? "border-red-300 text-red-700"
      : tone === "warn"
        ? "border-amber-300 text-amber-700"
        : "border-border";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left p-3 rounded-lg border transition-all bg-card hover:bg-muted/40",
        toneCls,
        ativo && "ring-2 ring-foreground/40 bg-muted",
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">{valor}</div>
    </button>
  );
}

function CardTitulo({
  titulo, etapa, onAcao, onPular, onPausar, onRenegociar,
}: {
  titulo: TituloCobranca;
  etapa: ReguaEtapa | null;
  onAcao: () => void;
  onPular: () => void;
  onPausar: () => void;
  onRenegociar: () => void;
}) {
  const nome = titulo.parceiro_nome_fantasia || titulo.parceiro_razao_social || "—";
  return (
    <div className="rounded-md border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{nome}</p>
          <p className="text-xs text-muted-foreground">
            {titulo.parceiro_cnpj ? formatCNPJ(titulo.parceiro_cnpj) : ""}
          </p>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            {titulo.numero_titulo}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-semibold text-sm">{formatBRL(titulo.valor_efetivo)}</div>
          {(titulo.dias_atraso ?? 0) > 0 ? (
            <Badge variant="destructive" className="text-[10px]">
              há {titulo.dias_atraso}d
            </Badge>
          ) : (titulo.dias_atraso ?? 0) < 0 ? (
            <Badge variant="outline" className="text-[10px]">
              D{titulo.dias_atraso}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">hoje</Badge>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {etapa && (
          <Badge variant="secondary" className="text-[10px]">
            {CANAL_LABEL[etapa.canal_sugerido] ?? etapa.canal_sugerido}
          </Badge>
        )}
        {titulo.vip_relacionamento && (
          <Badge className="text-[10px] bg-amber-100 text-amber-800 border border-amber-300">
            <Star className="h-3 w-3 mr-0.5" /> VIP
          </Badge>
        )}
        {titulo.flag_bandeira_amarela && (
          <Badge className="text-[10px] bg-yellow-100 text-yellow-800 border border-yellow-300">
            <AlertTriangle className="h-3 w-3 mr-0.5" /> Bandeira amarela
          </Badge>
        )}
        {titulo.flag_grupo_economico_inadimplente && (
          <Badge className="text-[10px] bg-red-100 text-red-800 border border-red-300">
            <Users className="h-3 w-3 mr-0.5" /> Grupo inadimplente
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 pt-1">
        <Button size="sm" className="h-7 text-xs" onClick={onAcao} disabled={!etapa}>
          Registrar ação
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onPular} disabled={!etapa}>
          Pular
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onPausar}>
          Pausar
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRenegociar}>
          Renegociar
        </Button>
      </div>
    </div>
  );
}

async function despausarTitulo(tituloId: string, qc: ReturnType<typeof useQueryClient>) {
  const { data, error } = await (supabase as any).rpc("despausar_regua_titulo", {
    p_titulo_id: tituloId,
  });
  if (error) {
    toast.error(error.message ?? "Erro ao despausar régua.");
    return;
  }
  if (data && data.ok === false) {
    toast.error(data.erro ?? "Erro ao despausar régua.");
    return;
  }
  toast.success("Régua despausada.");
  qc.invalidateQueries({ queryKey: ["titulos-cobranca"] });
}

async function rodarReguaAgora(qc: ReturnType<typeof useQueryClient>) {
  const { data, error } = await (supabase as any).rpc("fn_regua_materializar");
  if (error) {
    toast.error(error.message ?? "Erro ao rodar régua.");
    return;
  }
  if (data && data.ok === false) {
    toast.error(data.erro ?? "Erro ao rodar régua.");
    return;
  }
  const qtd = data?.titulos_atualizados ?? 0;
  toast.success(`Régua rodada — ${qtd} título(s) atualizado(s).`);
  qc.invalidateQueries({ queryKey: ["titulos-cobranca"] });
}

export default function ReguaTab() {
  const qc = useQueryClient();
  const { data: etapas = [] } = useReguaEtapas();
  const { data: fila = [], isLoading: loadingFila } = useReguaFilaHoje();
  const { data: pausados = [], isLoading: loadingPausados } = useReguaPausados();
  const { data: todosTitulos = [] } = useTitulosCobranca();

  const [vista, setVista] = useState<Vista>("fila");
  const [acaoDialog, setAcaoDialog] = useState<{ titulo: TituloCobranca; etapa: ReguaEtapa | null; modo: "enviada" | "pulada" } | null>(null);
  const [pausarDialog, setPausarDialog] = useState<{ titulo: TituloCobranca; etapa: ReguaEtapa | null } | null>(null);
  const [renegociarDialog, setRenegociarDialog] = useState<{ titulo: TituloCobranca; etapa: ReguaEtapa | null } | null>(null);

  const totalAtraso = useMemo(
    () => todosTitulos.filter((t) => t.status_gestao === "atrasado").length,
    [todosTitulos],
  );

  const lista = vista === "fila" ? fila : pausados;
  const loading = vista === "fila" ? loadingFila : loadingPausados;

  // Agrupa por descrição da etapa aplicável
  const grupos = useMemo(() => {
    const map = new Map<string, { etapa: ReguaEtapa | null; titulos: TituloCobranca[] }>();
    for (const t of lista) {
      const etapa = resolverEtapaParaTitulo(t, etapas);
      const key = etapa?.descricao_acao ?? "Sem etapa aplicável";
      if (!map.has(key)) map.set(key, { etapa, titulos: [] });
      map.get(key)!.titulos.push(t);
    }
    return Array.from(map.entries());
  }, [lista, etapas]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="grid grid-cols-3 gap-3 flex-1 max-w-2xl">
          <KpiCard
            label="Fila de hoje"
            valor={fila.length}
            ativo={vista === "fila"}
            onClick={() => setVista("fila")}
          />
          <KpiCard
            label="Pausados"
            valor={pausados.length}
            ativo={vista === "pausados"}
            onClick={() => setVista("pausados")}
            tone="warn"
          />
          <KpiCard
            label="Em atraso total"
            valor={totalAtraso}
            ativo={false}
            onClick={() => { /* somente informativo */ }}
            tone="danger"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => rodarReguaAgora(qc)}
          title="Rodar régua agora"
          className="text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Rodar régua agora
        </Button>
      </div>

      {etapas.length === 0 && (
        <Alert>
          <AlertDescription className="text-xs">
            Nenhuma etapa de régua cadastrada. Configure em Parâmetros → Régua de Cobrança.
          </AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {!loading && lista.length === 0 && (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          {vista === "fila" ? "Fila do dia vazia — nada para cobrar hoje." : "Nenhum título com régua pausada."}
        </div>
      )}

      {!loading && grupos.map(([nomeGrupo, { etapa, titulos }]) => (
        <section key={nomeGrupo} className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{nomeGrupo}</h3>
            <span className="text-xs text-muted-foreground">{titulos.length} título(s)</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {titulos.map((t) => (
              <div key={t.id} className="space-y-2">
                <CardTitulo
                  titulo={t}
                  etapa={etapa}
                  onAcao={() => setAcaoDialog({ titulo: t, etapa, modo: "enviada" })}
                  onPular={() => setAcaoDialog({ titulo: t, etapa, modo: "pulada" })}
                  onPausar={() => setPausarDialog({ titulo: t, etapa })}
                  onRenegociar={() => setRenegociarDialog({ titulo: t, etapa })}
                />
                {vista === "pausados" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-7 text-xs"
                    onClick={() => despausarTitulo(t.id, qc)}
                  >
                    <Play className="h-3 w-3 mr-1" /> Despausar
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {acaoDialog && (
        <AcaoReguaDialog
          titulo={acaoDialog.titulo}
          etapa={acaoDialog.etapa}
          modo={acaoDialog.modo}
          open={!!acaoDialog}
          onClose={() => setAcaoDialog(null)}
        />
      )}
      {pausarDialog && (
        <PausarReguaDialog
          titulo={pausarDialog.titulo}
          etapa={pausarDialog.etapa}
          open={!!pausarDialog}
          onClose={() => setPausarDialog(null)}
        />
      )}
      {renegociarDialog && (
        <RenegociarTituloDialog
          titulo={renegociarDialog.titulo}
          etapa={renegociarDialog.etapa}
          open={!!renegociarDialog}
          onClose={() => setRenegociarDialog(null)}
        />
      )}
    </div>
  );
}
