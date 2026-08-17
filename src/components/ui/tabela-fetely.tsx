import { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { EstadoVazio } from "@/components/ui/estado-vazio";

import { cn } from "@/lib/utils";

/**
 * Sistema Visual Fetely §8 e §10 — a moldura unica de listagem.
 * Entrega busca, contagem, esqueleto, vazio, erro e paginacao.
 * A tabela em si vem por children: cada tela mantem suas colunas.
 * Estado vazio e CONVITE, nao lamento (§10).
 */
interface TabelaFetelyProps {
  busca?: { valor: string; aoMudar: (v: string) => void; placeholder?: string };
  /** controles extras a direita da busca (selects, toggles) */
  filtros?: ReactNode;
  carregando?: boolean;
  erro?: string | null;
  aoTentarNovamente?: () => void;
  /** sem nenhum registro na origem */
  vazio?: { mensagem: string; acao?: ReactNode };
  /** ha registros, mas o filtro nao bateu */
  semResultado?: string;
  total: number;
  exibidos: number;
  /** plural minusculo: "entregas", "pedidos", "titulos" */
  rotulo?: string;
  rodapeDireita?: ReactNode;
  children: ReactNode;
  className?: string;
}

function EsqueletoTabela() {
  return (
    <div className="rounded-md border divide-y">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-3">
          <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/6 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/5 animate-pulse rounded bg-muted" />
          <div className="ml-auto h-3 w-16 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

export function TabelaFetely({
  busca, filtros, carregando, erro, aoTentarNovamente,
  vazio, semResultado, total, exibidos, rotulo = "registros",
  rodapeDireita, children, className,
}: TabelaFetelyProps) {
  const semNada = !carregando && !erro && total === 0;
  const filtroVazio = !carregando && !erro && total > 0 && exibidos === 0;

  return (
    <div className={cn("space-y-3", className)}>
      {(busca || filtros) && (
        <div className="flex flex-wrap items-center gap-2">
          {busca && (
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={busca.valor}
                onChange={(e) => busca.aoMudar(e.target.value)}
                placeholder={busca.placeholder ?? "Buscar…"}
                className="pl-8"
              />
            </div>
          )}
          {filtros}
        </div>
      )}

      {carregando ? (
        <EsqueletoTabela />
      ) : erro ? (
        <div className="space-y-3 rounded-lg border p-10 text-center">
          <p className="text-sm text-destructive">{erro}</p>
          {aoTentarNovamente && (
            <Button variant="outline" size="sm" onClick={aoTentarNovamente}>
              Tentar de novo
            </Button>
          )}
        </div>
      ) : semNada ? (
        <EstadoVazio
          mensagem={vazio?.mensagem ?? "Nada por aqui ainda."}
          acao={vazio?.acao}
        />
      ) : filtroVazio ? (

        <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">
          {semResultado ?? "Nenhum resultado para esse filtro."}
        </div>
      ) : (
        children
      )}

      {!carregando && !erro && total > 0 && (
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {total} {rotulo}
            {exibidos !== total && ` · ${exibidos} exibidos`}
          </span>
          {rodapeDireita}
        </div>
      )}
    </div>
  );
}
