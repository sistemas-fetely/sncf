import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ROTULO_FALLBACK, fmtFoto } from "@/components/pedidos/BlocoFaltaEstoqueXpm";
import type { ItemPreviaEstoqueXpm } from "@/hooks/pedidos/usePreviaEstoqueXpm";

/**
 * BLOQUEIO-COM-TETO (11/11/2026): o estoque entra em `bloqueios` como UMA única
 * string ("<rótulo do veredito>: <frase com os SKUs>"), apensada depois dos
 * demais bloqueios — com dezenas de itens ela vira uma parede de texto. Aqui
 * esse bloqueio é substituído por linhas de resumo agrupadas por veredito_item
 * (com contagem); a string longa fica atrás de "ver itens", quebrada por " · "
 * num container com teto e rolagem própria. Os demais bloqueios (poucos e
 * curtos) continuam listados como sempre.
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

/** O bloqueio de estoque é a string que começa com "<rótulo do veredito>:". */
function ehBloqueioEstoque(texto: string, vereditoRotulo: string | null): boolean {
  if (vereditoRotulo && texto.startsWith(`${vereditoRotulo}:`)) return true;
  return Object.values(ROTULO_FALLBACK).some((r) => texto.startsWith(`${r}:`));
}

interface Props {
  /** Textos de bloqueio da prévia — o de estoque é UMA string longa com os SKUs. */
  bloqueios: string[];
  /** Rótulo do veredito da prévia de estoque (prefixo do bloqueio de estoque). */
  vereditoRotulo?: string | null;
  /** Itens da prévia de estoque (com veredito por item) — base do resumo. */
  itens?: ItemPreviaEstoqueXpm[];
  fotoEm?: string | null;
}

export function ResumoBloqueiosXpm({ bloqueios, vereditoRotulo = null, itens = [], fotoEm = null }: Props) {
  const [aberto, setAberto] = useState(false);
  const bloqueioEstoque = bloqueios.find((b) => ehBloqueioEstoque(b, vereditoRotulo)) ?? null;
  const outros = bloqueios.filter((b) => b !== bloqueioEstoque);
  // Sem itens detalhados, o resumo cai para o rótulo puro (texto antes do ":").
  const rotuloEstoque = bloqueioEstoque?.split(":")[0] ?? null;
  const linhasEstoque = bloqueioEstoque
    ? bloqueioEstoque.split(" · ").map((l) => l.trim()).filter(Boolean)
    : [];

  return (
    <>
      {bloqueioEstoque && (
        itens.length > 0 ? (
          <LinhasResumoEstoque itens={itens} fotoEm={fotoEm} />
        ) : (
          <p className="tabular-nums">{rotuloEstoque}</p>
        )
      )}
      {outros.map((b) => (
        <p key={b} className="tabular-nums">{b}</p>
      ))}
      {bloqueioEstoque && (
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
              {linhasEstoque.map((l, i) => (
                <p key={`${i}-${l}`} className="tabular-nums">{l}</p>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </>
  );
}
