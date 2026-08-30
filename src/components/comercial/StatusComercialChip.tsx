import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  COR_STATUS_CLASSE,
  useDefinirStatusComercial,
  useStatusComercialOpcoes,
} from "@/hooks/comercial/useMesaComercial";

/**
 * Status comercial MANUAL. Vive ao lado do chip de temperatura do sistema —
 * são dois conceitos distintos e nenhum substitui o outro.
 * DIMENSAO-VIA-TABELA: as opções vêm de `oportunidade_status_comercial`.
 */
export function StatusComercialChip({
  pedidoId,
  slug,
  rotulo,
  cor,
  className,
  temperaturaSistema,
  temperaturaScore,
}: {
  pedidoId: string;
  slug: string | null;
  rotulo: string | null;
  cor: string | null;
  className?: string;
  temperaturaSistema?: string | null;
  temperaturaScore?: number | null;
}) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const opcoes = useStatusComercialOpcoes();
  const definir = useDefinirStatusComercial();

  const escolher = async (paraSlug: string) => {
    if (paraSlug === slug) {
      setAberto(false);
      return;
    }
    try {
      await definir.mutateAsync({ pedidoId, deSlug: slug, paraSlug, motivo });
      setMotivo("");
      setAberto(false);
    } catch {
      /* FAIL-LOUD: rollback e toast já feitos no hook */
    }
  };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button type="button" title="Status comercial (manual) — clique para mudar">
          <Badge
            variant="outline"
            className={cn(
              "rounded px-1.5 py-0 text-[10px] cursor-pointer hover:bg-muted",
              COR_STATUS_CLASSE[cor ?? ""] ?? "border-muted-foreground/40 text-muted-foreground",
              className,
            )}
          >
            {definir.isPending && <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />}
            {rotulo || "Definir status"}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2 space-y-2">
        {opcoes.isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (opcoes.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground py-2 px-1">
            Nenhum status comercial ativo cadastrado.
          </p>
        ) : (
          <div className="space-y-0.5">
            {(opcoes.data ?? []).map((o) => (
              <button
                key={o.slug}
                type="button"
                disabled={definir.isPending}
                onClick={() => void escolher(o.slug)}
                className="w-full flex items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-muted text-left"
              >
                <span
                  className={cn(
                    COR_STATUS_CLASSE[o.cor ?? ""]?.split(" ").find((c) => c.startsWith("text-")),
                  )}
                >
                  {o.rotulo}
                </span>
                {o.slug === slug && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            ))}
          </div>
        )}
        <div className="space-y-1 border-t pt-2">
          <Label className="text-[11px] text-muted-foreground">Motivo (opcional)</Label>
          <Textarea
            rows={2}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: cliente pediu para retomar em setembro"
            className="text-xs"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Chip somente-leitura da temperatura calculada pelo sistema. */
export const TEMPERATURA_LABEL: Record<string, string> = {
  quente: "QUENTE",
  morno: "Morno",
  frio: "Frio",
  nao_cobrar: "Não cobrar",
};

export const TEMPERATURA_CLASSES: Record<string, string> = {
  quente: "border-destructive/50 text-destructive",
  morno: "border-warning/50 text-warning",
  frio: "border-muted-foreground/40 text-muted-foreground",
  nao_cobrar: "border-muted-foreground/40 text-muted-foreground",
};

export function TemperaturaChip({
  temperatura,
  score,
}: {
  temperatura: string | null;
  score: number | null;
}) {
  if (!TEMPERATURA_LABEL[temperatura ?? ""]) return null;
  return (
    <Badge
      variant="outline"
      className={cn("rounded px-1.5 py-0 text-[10px]", TEMPERATURA_CLASSES[temperatura ?? ""])}
      title={`Temperatura do sistema (calculada) · score ${score ?? 0}`}
    >
      {TEMPERATURA_LABEL[temperatura ?? ""]}
    </Badge>
  );
}
