import { cn } from "@/lib/utils";
import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CodProduto } from "@/components/produto/CodProduto";
import { AplicarContagemDialog } from "@/components/estoque/AplicarContagemDialog";
import { AjustarPeloArmazemDialog } from "@/components/estoque/AjustarPeloArmazemDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useCanaisProduto, useRetencaoCanal } from "@/hooks/estoque/useCentralEstoque";
import { ePrincipal, type ProdutoCentral, type LinhaCentral } from "@/lib/estoque/centralEstoque";
import { fmtData } from "@/lib/data";
import { formatError } from "@/lib/format-error";
import { AcaoEstoqueDialog, type ModoAcao } from "./AcaoEstoqueDialog";
import { classeStatus, rotuloStatus } from "./statusVisual";
import { AcoesAlertasEstoque } from "@/components/estoque/AcoesAlertasEstoque";
import type { AlertaProduto } from "@/lib/estoque/filaOperacionalEstoque";
import { formatBRL } from "@/lib/format-currency";

const fmt = (v: number | null | undefined) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
const CANAIS = [
  { canal: "B2B", rotulo: "B2B · FOP" },
  { canal: "B2C", rotulo: "B2C · Shopify" },
  { canal: "VD", rotulo: "VD · Bling" },
] as const;

export function GavetaProdutoEstoque({ produto, alerta, onFechar }: { produto: ProdutoCentral | null; alerta?: AlertaProduto; onFechar: () => void }) {
  const sku = produto?.sku ?? null;
  const canais = useCanaisProduto(sku);
  const { reter, liberar } = useRetencaoCanal();
  const { roles } = useAuth();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const [centroSel, setCentroSel] = useState<string>("");
  const [modo, setModo] = useState<ModoAcao | null>(null);
  const [aplicar, setAplicar] = useState(false);
  const [ajustar, setAjustar] = useState(false);
  const [motivoRet, setMotivoRet] = useState<Record<string, string>>({});
  const [repor, setRepor] = useState(false);

  if (!produto) return <Sheet open={false} />;
  const todos = [...produto.principais, ...produto.terceiros].sort((a, b) => Number(a.centro_ordem ?? 0) - Number(b.centro_ordem ?? 0));
  const cdAtual: LinhaCentral | undefined = produto.centros[centroSel] ?? produto.principais[0];
  const rotulo = `${produto.cod_cadastro ?? produto.sku} · ${produto.nome ?? ""}`;
  const manual = cdAtual && cdAtual.papel !== "mae";
  const destinos = produto.principais.filter((l) => l.papel !== "mae" && l.centro !== cdAtual?.centro).map((l) => ({ codigo: l.centro, rotulo: l.centro_rotulo ?? l.centro }));
  const c = canais.data;

  const publicado = (canal: string) => {
    if (!c) return "—";
    if (canal === "B2B") return fmt(c.fop?.estoque_fop);
    if (canal === "B2C") return c.shopify.map((s) => `${fmt(s.shopify_atual)} (SNCF ${fmt(s.sncf_virtual)})`).join(" · ") || "—";
    return c.bling.map((b) => `${b.centro}: ${fmt(b.bling_atual)} (SNCF ${fmt(b.sncf_disponivel)})`).join(" · ") || "—";
  };

  return (
    <Sheet open={!!produto} onOpenChange={(o) => !o && onFechar()}>
      <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto space-y-5">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><CodProduto chave={produto.sku} /> {produto.nome}</SheetTitle>
          <SheetDescription>{[produto.cor, produto.colecao, produto.fase].filter(Boolean).join(" · ")}</SheetDescription>
        </SheetHeader>

        <section className="rounded-md border bg-card shadow-sm overflow-hidden">
          <Table className="text-xs">
            <TableHeader className="bg-muted">
              <TableRow>
                {["CD", "Disp.", "Contábil", "Vendável", "Bloq.", "Reserv.", "A caminho", "Real", "Dem./dia"].map((h) => <TableHead key={h} className="text-right first:text-left whitespace-nowrap px-2">{h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {todos.map((l) => (
                <Fragment key={l.centro}>
                  <TableRow className={cn("border-b-0", l.papel === "terceiro" && "text-muted-foreground")}>
                    <TableCell className="px-2"><span className="font-medium">{l.centro_rotulo}</span> <span className="text-muted-foreground">· {l.papel_rotulo}</span></TableCell>
                    <TableCell className="px-2 text-right tabular-nums font-bold text-sm">{fmt(l.disponivel)}</TableCell>
                    <TableCell className="px-2 text-right tabular-nums">{fmt(l.contabil)}</TableCell>
                    <TableCell className="px-2 text-right tabular-nums">{fmt(l.vendavel)}</TableCell>
                    <TableCell className="px-2 text-right tabular-nums">{fmt(l.bloqueado)}</TableCell>
                    <TableCell className="px-2 text-right tabular-nums">{fmt(l.reservado)}</TableCell>
                    <TableCell className="px-2 text-right tabular-nums">{fmt(l.a_caminho)}</TableCell>
                    <TableCell className="px-2 text-right tabular-nums whitespace-nowrap" title={l.papel === "mae" ? "Foto da API do armazém" : "Última contagem"}>
                      {fmt(l.real_centro)}{l.papel !== "mae" && <span className="block text-[10px] text-muted-foreground">{l.contagem_em ? fmtData(l.contagem_em) : "sem contagem"}</span>}
                    </TableCell>
                    <TableCell className="px-2 text-right tabular-nums">{fmt(l.demanda_dia)}</TableCell>
                  </TableRow>
                  <TableRow className={cn("hover:bg-transparent", l.papel === "terceiro" && "text-muted-foreground")}>
                    <TableCell colSpan={9} className="px-2 pt-0 pb-2">
                      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[11px] text-muted-foreground tabular-nums">
                        <span>Cobertura {l.cobertura_dias == null ? "—" : `${fmt(l.cobertura_dias)} d`}</span>
                        <span>·</span>
                        <span>Piso {fmt(l.piso_un)} un{l.piso_dias != null ? ` / ${fmt(l.piso_dias)} d` : ""}</span>
                        <Badge variant="outline" className={classeStatus(l)}>{l.status === "retido" && <Lock className="h-3 w-3 mr-1" />}{rotuloStatus(l)}</Badge>
                      </div>
                    </TableCell>
                  </TableRow>
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </section>

        {alerta && (alerta.parado_xpm || alerta.devolucao_alta || alerta.sem_giro) && <section className="space-y-2">
          <h3 className="text-sm font-semibold">Alertas</h3>
          {alerta.parado_xpm && <div className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-xs">
            <div><b>Parado na XPM</b><div className="text-muted-foreground tabular-nums">Saldo {fmt(alerta.saldo_xpm)} · disponível {fmt(alerta.disp_xpm)} · reservado {fmt(alerta.res_xpm)} · teto SP {fmt(alerta.teto_sp)}<br />{formatBRL(Number(alerta.custo_posicao_mes ?? 0))}/mês em posição</div></div>
            <AcoesAlertasEstoque card="parado_xpm" alertas={[alerta]} />
          </div>}
          {alerta.devolucao_alta && <div className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-xs">
            <div><b>Devolução alta</b><div className="text-muted-foreground tabular-nums">{fmt(alerta.devolucoes_janela)} devoluções · {fmt(alerta.un_devolvidas_janela)} un devolvidas / {fmt(alerta.un_vendidas_janela)} vendidas · {fmt(alerta.taxa_devolucao_pct)}%</div></div>
            <AcoesAlertasEstoque card="devolucao_alta" alertas={[alerta]} />
          </div>}
          {alerta.sem_giro && <div className="border-b py-2 text-xs"><b>Sem giro</b><div className="text-muted-foreground tabular-nums">{fmt(alerta.saldo_rede)} un paradas · {fmt(alerta.dias_sem_venda)} dias sem venda · última venda {alerta.ultima_venda ? fmtData(alerta.ultima_venda) : "—"}</div></div>}
        </section>}

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Canais</h3>
          {canais.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : canais.error ? (
            <Alert variant="destructive"><AlertDescription className="text-xs">{formatError(canais.error)}</AlertDescription></Alert>
          ) : (
            <div className="grid gap-2 md:grid-cols-3">
              {CANAIS.map(({ canal, rotulo: rc }) => {
                const atende = produto.principais.filter((l) => l.regras?.[canal]).sort((a, b) => Number(a.centro_ordem ?? 0) - Number(b.centro_ordem ?? 0));
                const ret = canal === "B2C"
                  ? (c?.retB2c ? { id: c.retB2c.id, motivo: c.retB2c.motivo, desde: c.retB2c.retido_em } : null)
                  : (c?.retCanal.find((r) => r.canal === canal) ? (() => { const r = c!.retCanal.find((x) => x.canal === canal)!; return { id: r.id, motivo: r.motivo, desde: r.retido_em }; })() : null);
                return (
                  <div key={canal} className="rounded-md border bg-card p-3 shadow-sm space-y-1.5 text-xs">
                    <div className="font-semibold">{rc}</div>
                    <div>Atende: {atende.map((l) => `${l.centro_rotulo}${l.regras![canal].redireciona_para ? ` → ${l.regras![canal].redireciona_para}` : ""}`).join(" · ") || "—"}</div>
                    <div>Publicando: <span className="tabular-nums">{publicado(canal)}</span></div>
                    <div>SNCF disp.: <span className="tabular-nums font-medium">{atende.map((l) => `${l.centro_rotulo} ${fmt(l.disponivel)}`).join(" · ") || "—"}</span></div>
                    {ret ? (
                      <div className="space-y-1">
                        <Badge variant="outline" className="border-primary text-primary"><Lock className="h-3 w-3 mr-1" />Retido desde {fmtData(ret.desde)}</Badge>
                        <div className="text-muted-foreground">{ret.motivo}</div>
                        <Button size="sm" variant="outline" disabled={liberar.isPending} onClick={() => liberar.mutate({ sku: produto.sku, canal, id: ret.id })}>Liberar</Button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <Input className="h-8 text-xs" placeholder="Motivo" value={motivoRet[canal] ?? ""} onChange={(e) => setMotivoRet((m) => ({ ...m, [canal]: e.target.value }))} />
                        <Button size="sm" variant="outline" disabled={reter.isPending || (motivoRet[canal] ?? "").trim().length < 3}
                          onClick={() => reter.mutate({ sku: produto.sku, canal, motivo: motivoRet[canal] ?? "" }, { onSuccess: () => setMotivoRet((m) => ({ ...m, [canal]: "" })) })}>Reter no canal</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {(produto.principais.flatMap((l) => l.retencoes ?? []).length > 0) && (
            <div className="text-xs text-muted-foreground">Retenções na view: {produto.principais.flatMap((l) => (l.retencoes ?? []).map((r) => `${l.centro_rotulo}/${r.canal}: ${r.motivo} (${fmtData(r.desde)})`)).join(" · ")}</div>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Ações</h3>
            <Select value={cdAtual?.centro ?? ""} onValueChange={setCentroSel}>
              <SelectTrigger className="h-8 w-48 text-xs"><SelectValue placeholder="CD" /></SelectTrigger>
              <SelectContent>{produto.principais.filter((l) => ePrincipal(l.papel)).map((l) => <SelectItem key={l.centro} value={l.centro}>{l.centro_rotulo}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setRepor((v) => !v)}>Repor</Button>
            {manual && <Button size="sm" variant="outline" onClick={() => setModo("contar")}>Contar</Button>}
            {isSuperAdmin && manual && Number(cdAtual?.furo ?? 0) !== 0 && <Button size="sm" variant="outline" onClick={() => setAplicar(true)}>Aplicar contagem</Button>}
            {isSuperAdmin && cdAtual?.centro === "XPM-SC" && cdAtual.diverge_real && <Button size="sm" variant="outline" onClick={() => setAjustar(true)}>Ajustar pelo armazém</Button>}
            <Button size="sm" variant="outline" onClick={() => setModo("reclassificar")}>Reclassificar condição</Button>
            <Button size="sm" variant="outline" onClick={() => setModo("movimento")}>Movimento manual</Button>
            {manual && destinos.length > 0 && <Button size="sm" variant="outline" onClick={() => setModo("transferencia")}>Transferência interna</Button>}
          </div>
          {repor && (
            <div className="rounded-md border bg-card p-3 text-xs shadow-sm space-y-1">
              {canais.error ? <p className="text-destructive">{formatError(canais.error)}</p> : canais.isLoading ? <p>Carregando…</p> : (c?.reposicao ?? []).length === 0 ? <div className="text-muted-foreground">Sem sugestão de reposição.</div> : c?.reposicao.map((r, i) => (
                <div key={i} className="tabular-nums space-y-1"><div>{r.classe_rotulo ?? r.classe} · mín/teto {fmt(r.minimo)}/{fmt(r.teto)} · posição {fmt(r.posicao)}</div><div><b>{fmt(r.qtd_sugerida)} kits</b> · {r.situacao ?? "—"} · {r.ritmo ?? "—"}</div></div>
              ))}
              <Link className="text-primary underline" to={`/pedidos/transferencias?aba=nova&sku=${encodeURIComponent(produto.sku)}`}>Criar transferência</Link>
            </div>
          )}
        </section>

        <footer className="flex gap-4 border-t pt-3 text-xs">
          <Link className="text-primary underline" to={`/vendas/produto/estoque/virtual?q=${encodeURIComponent(produto.cod_cadastro ?? produto.sku)}`}>Ver no Cockpit</Link>
          <Link className="text-primary underline" to={`/vendas/produto/estoque/conciliacao?q=${encodeURIComponent(produto.cod_cadastro ?? produto.sku)}`}>Ver na Conciliação</Link>
        </footer>

        {cdAtual && (
          <AcaoEstoqueDialog modo={modo} sku={produto.sku} rotuloProduto={rotulo} centro={cdAtual.centro} centroRotulo={cdAtual.centro_rotulo ?? cdAtual.centro} destinos={destinos} onFechar={() => setModo(null)} />
        )}
        <AplicarContagemDialog aberto={aplicar} onFechar={() => setAplicar(false)} centro={cdAtual?.centro ?? null} centroNome={cdAtual?.centro_rotulo} skus={[produto.sku]} onAplicado={() => setAplicar(false)} />
        <AjustarPeloArmazemDialog aberto={ajustar} onFechar={() => setAjustar(false)} skus={[produto.sku]} onAjustado={() => setAjustar(false)} />
      </SheetContent>
    </Sheet>
  );
}
