import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAnalisesFila } from "@/hooks/credito/useAnalisesFila";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Sparkles, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BadgePreAprovado } from "./BadgePreAprovado";
import type { EstagioAnalise } from "@/types/credito";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function tempoNaFila(criadoEm: string): string {
  const ms = Date.now() - new Date(criadoEm).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${min % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

interface Props {
  estagio: EstagioAnalise | "decididas";
}

export function FilaPorEstagio({ estagio }: Props) {
  const [busca, setBusca] = useState("");
  const navigate = useNavigate();

  const estagioParam = estagio === "decididas" ? undefined : (estagio as EstagioAnalise);
  const apenasAbertas = estagio !== "decididas";

  const { data: analises, isLoading } = useAnalisesFila({
    estagio: estagioParam,
    apenasAbertas,
    busca: busca || undefined,
  });

  const filtradas =
    estagio === "decididas"
      ? (analises || []).filter((a) => a.status_final !== null)
      : analises;

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por CNPJ, razão ou ID externo..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID Externo</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Condição</TableHead>
              <TableHead>{estagio === "decididas" ? "Status" : "Na fila"}</TableHead>
              <TableHead>IA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (!filtradas || filtradas.length === 0) && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhum pedido nesta fila.
                </TableCell>
              </TableRow>
            )}
            {filtradas?.map((a) => {
              const devolvida = a.foi_devolvida && !a.status_final;
              return (
                <TableRow
                  key={a.id}
                  className={cn(
                    "cursor-pointer hover:bg-muted/50",
                    devolvida && "border-l-4 border-l-orange-400",
                  )}
                  onClick={() => navigate(`/credito/analises/${a.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-primary">
                        {a.pedido_id_externo}
                      </span>
                      {devolvida && (
                        <Badge
                          variant="outline"
                          className="gap-1 text-[10px] py-0 px-1.5 border-orange-300 text-orange-700"
                        >
                          <Undo2 className="h-2.5 w-2.5" />
                          Devolvida
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{a.parceiro_razao || "Cliente novo"}</p>
                      {a.pre_aprovado_regra_id && (
                        <BadgePreAprovado regraNome={a.pre_aprovacao_regra_nome} compact />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{a.parceiro_cnpj}</p>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {fmtBRL.format(a.pedido_valor_liquido)}
                  </TableCell>
                  <TableCell className="text-sm">{a.pedido_condicao}</TableCell>
                  <TableCell>
                    {estagio === "decididas" ? (
                      <Badge variant="secondary">{a.status_final}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {tempoNaFila(a.criado_em)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {a.analise_ia_processada_em ? (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Sparkles className="h-3 w-3 text-primary" />
                        {a.analise_ia_confianca ? `${a.analise_ia_confianca}%` : "ok"}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {filtradas && filtradas.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {filtradas.length} pedido{filtradas.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
