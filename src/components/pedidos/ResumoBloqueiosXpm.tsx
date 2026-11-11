import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ROTULO_FALLBACK, fmtFoto } from "@/components/pedidos/BlocoFaltaEstoqueXpm";
import type { ItemPreviaEstoqueXpm } from "@/hooks/pedidos/usePreviaEstoqueXpm";

/**
 * BLOQUEIO-COM-TETO (11/11/2026): a lista de bloqueios do envio XPM crescia um
 * parágrafo por item (100+ itens = tela inteira de rolagem). Aqui os bloqueios
 * de estoque viram UMA linha de resumo por tipo, com contagem; a lista completa
 * fica atrás de "ver itens", num container com teto e rolagem própria.
 * Só apresentação — os textos e as regras continuam vindo da prévia do banco.
 */

interface GrupoEstoque {
  veredito: string;
  rotulo: string;
  n: number;
}

function agrupar(itens: ItemPreviaEstoqueXpm[]): GrupoEstoque[] {
  const mapa = new Map<string, GrupoEstoque>();
  for (const it of itens) {
    const veredito = it.veredito_item ?? "";
    const rotulo =
      it.veredito_item_rotulo || ROTULO_FALLBACK[veredito] || "Estoque insuficiente";
    const g = mapa.get(veredito) ?? { veredito, rotulo, n: 0 };
    g.n += 1;
    g.rotulo = rotulo;
    mapa.set(veredito, g);
  }
  return [...mapa.values()];
}

/** Linhas de resumo agrupadas por tipo de bloqueio de estoque ("<motivo> em N itens"). */
export function LinhasResumoEstoque({
  itens,
  fotoEm,
}: {
  itens: ItemPreviaEstoqueXpm[];
  fotoEm?: string | null;
}) {
  const foto = fmtFoto(fotoEm ?? itens[0]?.foto_em ?? null);
  return (
    <>
      {agrupar(itens).map((g) => (
        <p key={g.veredito || g.rotulo} className="tabular-nums">
          {g.rotulo} em {g.n} {g.n === 1 ? "item" : "itens"}
          {g.veredito === "foto_nao_cobre" && foto ? ` (foto de ${foto})` : ""}
        </p>
      ))}
    </>
  );
}

interface Props {
  /** Textos de bloqueio da prévia — os primeiros `itens.length` são os de estoque. */
  bloqueios: string[];
  /** Itens da prévia de estoque (com veredito por item). */
  itens?: ItemPreviaEstoqueXpm[];
  fotoEm?: string | null;
}

export function ResumoBloqueiosXpm({ bloqueios, itens = [], fotoEm = null }: Props) {
  const [aberto, setAberto] = useState(false);
  const outros = bloqueios.slice(itens.length);

  return (
    <>
      <LinhasResumoEstoque itens={itens} fotoEm={fotoEm} />
      {outros.map((b) => (
        <p key={b} className="tabular-nums">{b}</p>
      ))}
      {bloqueios.length > 0 && (
        <Collapsible open={aberto} onOpenChange={setAberto}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 text-[11px] underline underline-offset-2 opacity-80 hover:opacity-100"
            >
              {aberto ? "ocultar itens" : "ver itens"}
              <ChevronDown
                className={`h-3 w-3 transition-transform ${aberto ? "rotate-180" : ""}`}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="max-h-48 overflow-y-auto space-y-1 pr-1 pt-1">
              {bloqueios.map((b) => (
                <p key={b} className="tabular-nums">{b}</p>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </>
  );
}
