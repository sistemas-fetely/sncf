import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import { BotaoPermitido } from "./BotaoPermitido";
import { useDecidirNotaCartao, useNotaCartao, type NotaCartao } from "./useNotaCartao";

const parcelasTexto = (l: NotaCartao) => Number(l.parcelas ?? 1) > 1 ? `${l.parcelas}x ${formatBRL(l.valor_parcela)}` : "à vista";

function Situacao({ linha }: { linha: NotaCartao }) {
  return <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning whitespace-normal font-normal">{linha.situacao === "confirmar" ? "A confirmar" : "Mais de uma compra possível"}</Badge>;
}

export function AbaNotaCartao() {
  const { data = [], isLoading, error } = useNotaCartao();
  const { permitido } = usePermissaoAcaoOuSuperAdmin("acao.fin_conciliar");
  const [alvo, setAlvo] = useState<NotaCartao | null>(null);
  const decidir = useDecidirNotaCartao(() => setAlvo(null));
  const enviar = async (linha: NotaCartao, confirmar: boolean) => {
    if (!permitido || decidir.isPending) return;
    try { await decidir.mutateAsync({ linha, confirmar }); } catch { /* onError displays the original RPC error. */ }
  };
  const acoes = (linha: NotaCartao) => <div className="flex flex-wrap gap-2">
    <BotaoPermitido permitido={permitido} mensagemSemPermissao="Sem permissão para conciliar" size="sm" className="h-auto min-h-8 whitespace-normal text-left" disabled={decidir.isPending} onClick={() => setAlvo(linha)}>É a mesma compra</BotaoPermitido>
    <BotaoPermitido permitido={permitido} mensagemSemPermissao="Sem permissão para conciliar" size="sm" variant="outline" disabled={decidir.isPending} onClick={() => enviar(linha, false)}>Não é</BotaoPermitido>
  </div>;

  return <div className="space-y-3 min-w-0">
    <p className="text-sm text-muted-foreground">Compras no cartão que parecem ser a mesma de uma nota. Confirmando, a nota fica como a despesa e a linha do cartão deixa de contar em dobro.</p>
    {error ? <p role="alert" className="text-sm text-destructive">{formatError(error)}</p>
      : isLoading ? <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-40 w-full" /></div>
        : !data.length ? <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">Nenhum par aguardando decisão.</div>
          : <>
            <div className="hidden md:block rounded-md border bg-card">
              <Table className="table-fixed w-full [&_td]:px-2 [&_th]:px-2 [&_td]:break-words [&_th]:whitespace-normal">
                <TableHeader><TableRow>
                  <TableHead className="w-[10%]">Nota</TableHead><TableHead className="w-[15%]">Fornecedor</TableHead><TableHead className="w-[12%] text-right">Valor da nota</TableHead><TableHead className="w-[17%]">Compra no cartão</TableHead><TableHead className="w-[12%]">Parcelas</TableHead><TableHead className="w-[14%]">Situação</TableHead><TableHead className="w-[20%]">Ações</TableHead>
                </TableRow></TableHeader>
                <TableBody>{data.map((linha) => <TableRow key={`${linha.nf_id}:${linha.lancamento_id}`}>
                  <TableCell><p className="text-sm font-medium">{linha.nf_numero ?? "—"}</p><p className="text-xs text-muted-foreground">{formatDateBR(linha.emissao)}</p></TableCell>
                  <TableCell className="text-sm">{linha.fornecedor ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">{formatBRL(linha.nf_valor)}</TableCell>
                  <TableCell><p className="text-sm">{linha.cartao_descricao ?? "—"}</p><p className="text-xs text-muted-foreground">{formatDateBR(linha.data_compra)}</p></TableCell>
                  <TableCell className="text-xs tabular-nums">{parcelasTexto(linha)}</TableCell>
                  <TableCell><Situacao linha={linha} /></TableCell><TableCell>{acoes(linha)}</TableCell>
                </TableRow>)}</TableBody>
              </Table>
            </div>
            <div className="grid gap-3 md:hidden">{data.map((linha) => <article key={`${linha.nf_id}:${linha.lancamento_id}`} className="rounded-md border bg-card p-4 space-y-3">
              <div className="flex flex-wrap justify-between gap-2"><div><p className="font-medium">Nota {linha.nf_numero ?? "—"}</p><p className="text-xs text-muted-foreground">{formatDateBR(linha.emissao)}</p></div><Situacao linha={linha} /></div>
              <p className="text-sm break-words">{linha.fornecedor ?? "—"}</p>
              <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">Valor da nota</dt><dd className="tabular-nums">{formatBRL(linha.nf_valor)}</dd></div><div><dt className="text-xs text-muted-foreground">Parcelas</dt><dd className="tabular-nums">{parcelasTexto(linha)}</dd></div><div className="col-span-2"><dt className="text-xs text-muted-foreground">Compra no cartão</dt><dd className="break-words">{linha.cartao_descricao ?? "—"}<span className="block text-xs text-muted-foreground">{formatDateBR(linha.data_compra)}</span></dd></div></dl>
              {acoes(linha)}
            </article>)}</div>
          </>}
    <Dialog open={!!alvo} onOpenChange={(open) => { if (!open && !decidir.isPending) setAlvo(null); }}>
      <DialogContent><DialogHeader><DialogTitle>É a mesma compra?</DialogTitle><DialogDescription>Confirme o par abaixo. A nota fica como a despesa e a linha do cartão deixa de contar em dobro.</DialogDescription></DialogHeader>
        {alvo && <div className="space-y-3 text-sm break-words"><div><p className="font-medium">Nota {alvo.nf_numero ?? "—"} · {formatBRL(alvo.nf_valor)}</p><p>{alvo.fornecedor} · {formatDateBR(alvo.emissao)}</p></div><div><p className="font-medium">Compra no cartão: {alvo.cartao_descricao ?? "—"}</p><p>{formatDateBR(alvo.data_compra)} · {parcelasTexto(alvo)}</p></div></div>}
        <DialogFooter><Button variant="outline" disabled={decidir.isPending} onClick={() => setAlvo(null)}>Cancelar</Button><BotaoPermitido permitido={permitido} mensagemSemPermissao="Sem permissão para conciliar" disabled={decidir.isPending} onClick={() => alvo && enviar(alvo, true)}>{decidir.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar mesma compra</BotaoPermitido></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}