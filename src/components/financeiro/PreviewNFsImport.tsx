import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Download, AlertTriangle, X, ListTree, Package, Link2 } from "lucide-react";
import { formatDateBR } from "@/lib/format-currency";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CategoriaCombobox, type CategoriaOption } from "@/components/financeiro/CategoriaCombobox";
import { CriarRegraDialog } from "@/components/financeiro/CriarRegraDialog";
import { aplicarRegrasItem, useRegrasCategorizacao } from "@/hooks/useRegrasCategorizacao";
import type { ItemNFParsed, NFParsed } from "@/lib/financeiro/types";
import { cn } from "@/lib/utils";

interface Props {
  nfs: NFParsed[];
  categorias: CategoriaOption[];
  onChange: (nfs: NFParsed[]) => void;
  onImport: () => void | Promise<void>;
  onClear?: () => void;
  importing: boolean;
}

const formatBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

export function PreviewNFsImport({
  nfs,
  categorias,
  onChange,
  onImport,
  onClear,
  importing,
}: Props) {
  const [showOnlyMissing, setShowOnlyMissing] = useState(false);
  const [regraNF, setRegraNF] = useState<NFParsed | null>(null);
  const [regraCategoriaId, setRegraCategoriaId] = useState<string | null>(null);
  const [regraCategoriaNome, setRegraCategoriaNome] = useState<string | null>(null);
  const { data: regras } = useRegrasCategorizacao();

  const visibleIdx = useMemo(() => {
    return nfs
      .map((nf, i) => ({ nf, i }))
      .filter(({ nf }) => (showOnlyMissing ? !nf._plano_contas_id : true));
  }, [nfs, showOnlyMissing]);

  const totals = useMemo(() => {
    const semCat = nfs.filter((n) => !n._plano_contas_id && !n._duplicata && !n._match_pagamento).length;
    const dup = nfs.filter((n) => n._duplicata).length;
    const sel = nfs.filter((n) => n._selecionada && !n._duplicata).length;
    const vincular = nfs.filter((n) => n._match_pagamento && !n._duplicata).length;
    const novosProntos = nfs.filter(
      (n) => !n._match_pagamento && !n._duplicata && n._plano_contas_id,
    ).length;
    return { semCat, dup, sel, vincular, novosProntos };
  }, [nfs]);

  // Scroll automático para o preview quando tem muitas NFs (>5)
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [jaRolou, setJaRolou] = useState(false);
  useEffect(() => {
    if (nfs.length > 5 && !jaRolou && containerRef.current) {
      containerRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      setJaRolou(true);
    }
    if (nfs.length === 0) setJaRolou(false); // reset quando esvazia
  }, [nfs.length, jaRolou]);

  const allSelectableSelected =
    nfs.filter((n) => !n._duplicata).length > 0 &&
    nfs.filter((n) => !n._duplicata).every((n) => n._selecionada);

  function toggleAll() {
    const next = !allSelectableSelected;
    onChange(nfs.map((n) => (n._duplicata ? n : { ...n, _selecionada: next })));
  }

  function toggleOne(idx: number) {
    onChange(
      nfs.map((n, i) =>
        i === idx ? { ...n, _selecionada: !n._selecionada } : n
      )
    );
  }

  function setCategoria(idx: number, categoriaId: string | null) {
    const opt = categoriaId ? categorias.find((c) => c.id === categoriaId) || null : null;
    const nfAnterior = nfs[idx];
    const mudouManualmente =
      categoriaId && categoriaId !== nfAnterior._plano_contas_id;
    onChange(
      nfs.map((n, i) =>
        i === idx
          ? {
              ...n,
              _plano_contas_id: categoriaId,
              _categoria_nome: opt ? `${opt.codigo} — ${opt.nome}` : null,
              _regra_origem: null, // foi manual
            }
          : n
      )
    );
    // Após seleção manual, oferecer criar regra automática
    if (mudouManualmente && opt && (nfAnterior.fornecedor_cnpj || nfAnterior.nf_ncm)) {
      setRegraNF(nfAnterior);
      setRegraCategoriaId(categoriaId);
      setRegraCategoriaNome(`${opt.codigo} — ${opt.nome}`);
    }
  }

  function toggleExpandirItens(idx: number) {
    onChange(
      nfs.map((n, i) => {
        if (i !== idx) return n;
        const expandir = !n._expandirItens;
        let itens = n.itens;
        if (expandir && itens) {
          // Aplica regras nos itens que ainda não têm categoria
          itens = itens.map((it) => (it._plano_contas_id ? it : aplicarRegrasItem(it, regras)));
        }
        return { ...n, _expandirItens: expandir, itens };
      }),
    );
  }

  function setCategoriaItem(
    nfIdx: number,
    itemIdx: number,
    categoriaId: string | null,
  ) {
    const opt = categoriaId ? categorias.find((c) => c.id === categoriaId) || null : null;
    onChange(
      nfs.map((n, i) => {
        if (i !== nfIdx || !n.itens) return n;
        const novosItens = n.itens.map((it, j) =>
          j !== itemIdx
            ? it
            : {
                ...it,
                _plano_contas_id: categoriaId,
                _categoria_nome: opt ? `${opt.codigo} — ${opt.nome}` : null,
                _regra_origem: "manual" as const,
              },
        );
        return { ...n, itens: novosItens };
      }),
    );
  }

  if (nfs.length === 0) return null;

  return (
    <TooltipProvider delayDuration={150}>
    <div ref={containerRef} className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge variant="outline">{nfs.length} NFs</Badge>
        {totals.vincular > 0 && (
          <Badge variant="outline" className="gap-1 border-info/40 text-info">
            <Link2 className="h-3 w-3" />
            {totals.vincular} vincular a existentes
          </Badge>
        )}
        {totals.novosProntos > 0 && (
          <Badge variant="outline" className="border-success text-success">
            {totals.novosProntos} novos prontos
          </Badge>
        )}
        {totals.dup > 0 && (
          <Badge variant="secondary">
            {totals.dup} duplicadas (já existem)
          </Badge>
        )}
        {totals.semCat > 0 && (
          <Badge variant="outline" className="gap-1 border-warning text-warning">
            <AlertTriangle className="h-3 w-3" />
            {totals.semCat} sem categoria
          </Badge>
        )}
        <button
          type="button"
          className="text-xs underline text-muted-foreground hover:text-foreground"
          onClick={() => setShowOnlyMissing((v) => !v)}
        >
          {showOnlyMissing ? "Ver todas" : "Ver só sem categoria"}
        </button>
      </div>

      <div className="border rounded-md max-h-[calc(100vh-280px)] min-h-[300px] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  checked={allSelectableSelected}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>NF</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="min-w-[260px]">Categoria</TableHead>
              <TableHead className="w-10 text-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <ListTree className="h-4 w-4 text-muted-foreground" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Classificar itens individualmente</TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleIdx.map(({ nf, i }) => {
              const temItens = !!(nf.itens && nf.itens.length > 1);
              const expandido = !!nf._expandirItens;
              const itensClassificados = expandido && nf.itens
                ? nf.itens.filter((it) => it._plano_contas_id).length
                : 0;
              return (
                <Fragment key={`${nf.nf_chave_acesso || nf.nf_numero}-${i}`}>
                  <TableRow
                    className={cn(
                      nf._duplicata && "opacity-50",
                      !nf._duplicata && !nf._plano_contas_id && !expandido && "bg-muted/40",
                      expandido && "bg-admin/5",
                    )}
                  >
                    <TableCell>
                      <Checkbox
                        checked={!!nf._selecionada}
                        disabled={nf._duplicata}
                        onCheckedChange={() => toggleOne(i)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{nf.fornecedor_nome}</div>
                      {nf.fornecedor_cnpj && (
                        <div className="text-xs text-muted-foreground font-mono">
                          {nf.fornecedor_cnpj}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{nf.nf_numero || "—"}</div>
                      {nf.nf_serie && (
                        <div className="text-muted-foreground">Série {nf.nf_serie}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{formatDateBR(nf.nf_data_emissao)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {nf.valor.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </TableCell>
                    <TableCell>
                      {expandido ? (
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-admin/10 text-admin border-admin/30"
                          >
                            Múltiplas categorias
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {itensClassificados}/{nf.itens?.length || 0} classificados
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <div className="flex-1 min-w-0">
                            <CategoriaCombobox
                              options={categorias}
                              value={nf._plano_contas_id || null}
                              onChange={(id) => setCategoria(i, id)}
                              placeholder="Definir conta"
                            />
                          </div>
                          {nf._regra_origem && (
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {nf._regra_origem === "parceiro"
                                ? "por parceiro"
                                : nf._regra_origem === "ncm"
                                ? "por NCM"
                                : "por texto"}
                            </Badge>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {temItens && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => toggleExpandirItens(i)}
                              className={cn(
                                "p-1 rounded transition-colors",
                                expandido
                                  ? "bg-admin/15 text-admin"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
                              )}
                            >
                              <ListTree className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {expandido
                              ? "Voltar para categoria única"
                              : `Classificar ${nf.itens?.length} itens individualmente`}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell>
                      {nf._duplicata ? (
                        <Badge variant="secondary">Duplicada</Badge>
                      ) : nf._match_pagamento ? (
                        <div className="space-y-1">
                          <Badge className="text-[10px] bg-info/10 text-info hover:bg-info/10 gap-1">
                            <Link2 className="h-3 w-3" /> Vincular
                          </Badge>
                          <p className="text-[10px] text-muted-foreground line-clamp-2 max-w-[180px]">
                            {nf._match_pagamento.conta_descricao}
                          </p>
                          {nf._match_pagamento.conta_docs_status && (
                            <p className="text-[10px] text-info">
                              Docs: {nf._match_pagamento.conta_docs_status}
                            </p>
                          )}
                        </div>
                      ) : expandido ? (
                        itensClassificados === (nf.itens?.length || 0) ? (
                          <Badge variant="outline" className="border-success text-success">
                            Pronta
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-warning text-warning">
                            Parcial
                          </Badge>
                        )
                      ) : !nf._plano_contas_id ? (
                        <Badge variant="outline" className="border-warning text-warning">
                          Sem categoria
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-success text-success">
                          Pronta
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>

                  {expandido && nf.itens?.map((item, idx) => (
                    <TableRow
                      key={`${nf.nf_chave_acesso || nf.nf_numero}-${i}-item-${idx}`}
                      className="bg-muted/30 hover:bg-muted/40"
                    >
                      <TableCell></TableCell>
                      <TableCell>
                        <div className="pl-6 flex items-start gap-2">
                          <Package className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{item.descricao}</p>
                            <p className="text-[10px] text-muted-foreground">
                              NCM: {item.ncm || "—"}
                              {item.quantidade != null && (
                                <> · {item.quantidade} {item.unidade || ""}</>
                              )}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                      <TableCell className="text-right text-xs font-mono">
                        {formatBRL(item.valor_total || 0)}
                      </TableCell>
                      <TableCell>
                        <CategoriaCombobox
                          options={categorias}
                          value={item._plano_contas_id || null}
                          onChange={(id) => setCategoriaItem(i, idx, id)}
                          placeholder="Definir conta"
                        />
                      </TableCell>
                      <TableCell></TableCell>
                      <TableCell>
                        {item._plano_contas_id ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-success text-success"
                          >
                            {item._regra_origem === "ncm"
                              ? "por NCM"
                              : item._regra_origem === "texto"
                              ? "por texto"
                              : "manual"}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-warning text-warning"
                          >
                            Sem categ.
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {totals.sel} selecionada{totals.sel === 1 ? "" : "s"} para importar
        </p>
        <div className="flex items-center gap-2">
          {onClear && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              disabled={importing}
              className="gap-1 text-muted-foreground"
            >
              <X className="h-4 w-4" />
              Limpar
            </Button>
          )}
          <Button
            onClick={onImport}
            disabled={importing || totals.sel === 0}
            className="bg-admin hover:bg-admin/90 text-admin-foreground gap-2"
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Importar selecionadas
          </Button>
        </div>
      </div>

      <CriarRegraDialog
        open={!!regraNF}
        onOpenChange={(v) => {
          if (!v) {
            setRegraNF(null);
            setRegraCategoriaId(null);
            setRegraCategoriaNome(null);
          }
        }}
        nf={regraNF}
        categoriaId={regraCategoriaId}
        categoriaNome={regraCategoriaNome}
        centroCusto={regraNF?._centro_custo || null}
        allNfs={nfs}
        onUpdateAllNfs={onChange}
      />
    </div>
    </TooltipProvider>
  );
}
