import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { usePreferenciaTela } from "@/hooks/usePreferenciaTela";

export const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;
export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_PAGE_SIZE: PageSizeOption = 20;

/**
 * Compatibilidade: telas antigas chamam isso para semear o estado inicial.
 * A preferencia agora mora no banco (por usuario) — nada mais e' lido do
 * navegador, entao aqui so' sai o padrao. Quem passa `tela` ao rodape ganha
 * persistencia de verdade.
 */
export function lerTamanhoPaginaSalvo(_chavePreferencia?: string): PageSizeOption {
  return DEFAULT_PAGE_SIZE;
}

function buildPageRange(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

/**
 * Rodape colado da tabela: fecha o card do lado de baixo no mesmo tom `muted`
 * do cabecalho colado. Nasceu compartilhado para as filas nao divergirem.
 */
export function RodapePaginacao({
  total,
  pagina,
  tamanhoPagina,
  tela,
  onPagina,
  onTamanhoPagina,
  extraDireita,
}: {
  total: number;
  /** 1-based */
  pagina: number;
  tamanhoPagina: number;
  /** Slug da tela para guardar o tamanho de pagina no banco. Sem ela, nada persiste. */
  tela?: string;
  /** @deprecated chave de navegador — nao usada mais */
  chavePreferencia?: string;
  /** Conteudo opcional no fim da linha (ex.: status de sincronizacao). Telas que nao passam nada ficam como estao. */
  extraDireita?: ReactNode;
  onPagina: (p: number) => void;
  onTamanhoPagina: (n: number) => void;
}) {
  const { salvar } = usePreferenciaTela<{ tamanho_pagina?: number }>(tela ?? "", {});
  const totalPaginas = Math.max(1, Math.ceil(total / tamanhoPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicioRange = total === 0 ? 0 : (paginaAtual - 1) * tamanhoPagina + 1;
  const fimRange = Math.min(paginaAtual * tamanhoPagina, total);
  const pageRange = buildPageRange(paginaAtual, totalPaginas);

  return (
    <div className="sticky bottom-0 z-30 flex flex-wrap items-center justify-between gap-3 px-6 py-3 text-sm bg-muted border-t border-border shadow-[0_-2px_8px_-4px_hsl(var(--foreground)/0.1)]">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>
          {total === 0
            ? "Nenhum resultado"
            : <>Mostrando <span className="font-medium text-foreground tabular-nums">{inicioRange}</span>–<span className="font-medium text-foreground tabular-nums">{fimRange}</span> de <span className="font-medium text-foreground tabular-nums">{total}</span></>}
        </span>
        <span className="hidden sm:inline">·</span>
        <div className="hidden sm:flex items-center gap-1.5">
          <span>Por página:</span>
          <Select
            value={String(tamanhoPagina)}
            onValueChange={(v) => {
              const n = Number(v) as PageSizeOption;
              onTamanhoPagina(n);
              try {
                localStorage.setItem(chavePreferencia, String(n));
              } catch {
                // modo privativo pode bloquear o storage — a troca vale só nesta sessão
              }
              onPagina(1);
            }}
          >
            <SelectTrigger className="h-8 w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={paginaAtual <= 1}
            onClick={() => onPagina(1)}
            aria-label="Primeira página"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={paginaAtual <= 1}
            onClick={() => onPagina(Math.max(1, paginaAtual - 1))}
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {pageRange.map((p, idx) =>
            p === "…" ? (
              <span key={`e-${idx}`} className="px-2 text-muted-foreground select-none">…</span>
            ) : (
              <Button
                key={p}
                variant={p === paginaAtual ? "default" : "outline"}
                size="sm"
                className={cn(
                  "h-8 min-w-8 px-2 tabular-nums",
                  p === paginaAtual && "pointer-events-none",
                )}
                onClick={() => onPagina(p)}
                aria-current={p === paginaAtual ? "page" : undefined}
              >
                {p}
              </Button>
            ),
          )}

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={paginaAtual >= totalPaginas}
            onClick={() => onPagina(Math.min(totalPaginas, paginaAtual + 1))}
            aria-label="Próxima página"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={paginaAtual >= totalPaginas}
            onClick={() => onPagina(totalPaginas)}
            aria-label="Última página"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {extraDireita}
    </div>
  );
}
