import { Fragment, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { formatCNPJ } from "@/lib/cnpj";
import { formatError } from "@/lib/format-error";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { MOTIVOS_AGUARDA, MOTIVOS_PRECISA, ROTULO_MOTIVO, agruparPorFornecedor, rotuloPerfil } from "./perfilPagamento";
import { db, useFilaSemTitulo, useFormas, useInvalidarPerfis } from "./usePerfilPagamento";
import { PerfilPagamentoDialog, type AlvoPerfil } from "./PerfilPagamentoDialog";
import { BotaoPermitido } from "./BotaoPermitido";

interface RetornoGerar { ok?: boolean; decisao_humana?: boolean; motivo?: string | null }

export function AbaNotasSemTitulo() {
  const { data = [], isLoading, error } = useFilaSemTitulo();
  const { permitido } = usePermissaoAcaoOuSuperAdmin("acao.nf_gerar_titulo");
  const { nome, naoGera } = useFormas();
  const invalidar = useInvalidarPerfis();
  const [filtro, setFiltro] = useState<"precisa" | "aguarda">("precisa");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [alvo, setAlvo] = useState<AlvoPerfil | null>(null);
  const motivos = filtro === "precisa" ? MOTIVOS_PRECISA : MOTIVOS_AGUARDA;
  const grupos = useMemo(() => agruparPorFornecedor(data.filter((l) => motivos.includes(l.motivo))), [data, motivos]);

  const gerar = useMutation({
    mutationFn: async (nfId: string) => {
      const { data: r, error: e } = await db.rpc<RetornoGerar | RetornoGerar[]>("fn_nf_gerar_titulo", { p_nf_id: nfId });
      if (e) throw e;
      return Array.isArray(r) ? r[0] : r;
    },
    onSuccess: async (r) => {
      await invalidar();
      if (r?.ok === false || r?.decisao_humana === true) toast.warning(r.motivo ?? "");
      else toast.success("Título gerado");
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const alternar = (k: string) => setAbertos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return <div className="space-y-3">
    <div className="flex flex-wrap gap-1.5">
      <Button size="sm" className="h-8" variant={filtro === "precisa" ? "default" : "outline"} onClick={() => setFiltro("precisa")}>Precisa de você</Button>
      <Button size="sm" className="h-8" variant={filtro === "aguarda" ? "default" : "outline"} onClick={() => setFiltro("aguarda")}>Aguardando cartão / não gera título</Button>
    </div>
    {error && <p className="text-sm text-destructive">{formatError(error)}</p>}
    <div className="rounded-md border bg-card">
      <Table className="table-fixed w-full [&_td]:px-2 [&_th]:px-2">
        <TableHeader><TableRow>
          <TableHead className="w-[40%]">Fornecedor</TableHead><TableHead className="w-[12%] text-right">Notas</TableHead>
          <TableHead className="w-[16%] text-right">Valor</TableHead><TableHead className="w-[16%]">Sugestão</TableHead><TableHead className="w-[16%] text-right">Ação</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={5} className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            : !grupos.length ? <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Nenhuma nota nova sem título. Notas emitidas a partir de 12/11/2026 aparecem aqui quando o fornecedor ainda não tem perfil de pagamento.</TableCell></TableRow>
              : grupos.map((g) => <Fragment key={g.chave}>
                <TableRow className="cursor-pointer" onClick={() => alternar(g.chave)}>
                  <TableCell><div className="flex items-center gap-1.5 min-w-0">{abertos.has(g.chave) ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}<div className="min-w-0"><p className="truncate text-sm" title={g.fornecedor}>{g.fornecedor}</p>{g.cnpj && <p className="text-xs text-muted-foreground font-mono">{formatCNPJ(g.cnpj)}</p>}</div></div></TableCell>
                  <TableCell className="text-right tabular-nums">{g.notas.length}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBRL(g.valor)}</TableCell>
                  <TableCell className="text-xs truncate" title={g.sug_base ?? undefined}>{g.sug_forma_codigo || g.sug_prazo_dias != null ? `${nome(g.sug_forma_codigo) ?? ""}${g.sug_forma_codigo && g.sug_prazo_dias != null ? " · " : ""}${g.sug_prazo_dias != null ? `${g.sug_prazo_dias} dias` : ""}` : "—"}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {g.precisaPerfil && g.parceiro_id && <BotaoPermitido permitido={permitido} size="sm" variant="outline" className="h-7" onClick={() => { const atual = g.notas.find((n) => n.perfil_forma_codigo); setAlvo({ parceiro_id: g.parceiro_id as string, fornecedor: g.fornecedor, forma: atual?.perfil_forma_codigo ?? g.sug_forma_codigo, prazo: atual?.perfil_prazo_dias ?? g.sug_prazo_dias, parcelas: atual?.perfil_parcelas_dias, base: g.sug_base }); }}>Definir perfil</BotaoPermitido>}
                  </TableCell>
                </TableRow>
                {abertos.has(g.chave) && g.notas.map((n) => <TableRow key={n.nf_id} className="bg-muted/30">
                  <TableCell className="pl-8"><p className="text-xs font-mono">NF {n.nf_numero ?? "—"} · {formatDateBR(n.emissao)}</p><p className="text-xs text-muted-foreground truncate" title={n.plano_nome ?? n.destino_rotulo ?? undefined}>{n.plano_nome ?? n.destino_rotulo ?? ""}</p>{n.perfil_forma_codigo && <p className="text-xs text-muted-foreground">{rotuloPerfil(n.perfil_forma_nome ?? nome(n.perfil_forma_codigo), n.perfil_prazo_dias, !naoGera(n.perfil_forma_codigo), n.perfil_parcelas_dias)}</p>}</TableCell>
                  <TableCell colSpan={1} className="text-right text-xs">{formatDateBR(n.data_vencimento)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{formatBRL(n.valor)}</TableCell>
                  <TableCell><Badge variant="outline" className="font-normal text-xs max-w-full"><span className="break-words whitespace-normal">{ROTULO_MOTIVO[n.motivo] ?? n.motivo}</span></Badge></TableCell>
                  <TableCell className="text-right">{n.motivo === "pendente" && <BotaoPermitido permitido={permitido} size="sm" className="h-7" disabled={gerar.isPending} onClick={() => gerar.mutate(n.nf_id)}>{gerar.isPending && gerar.variables === n.nf_id && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Gerar título</BotaoPermitido>}</TableCell>
                </TableRow>)}
              </Fragment>)}
        </TableBody>
      </Table>
    </div>
    <PerfilPagamentoDialog alvo={alvo} onClose={() => setAlvo(null)} />
  </div>;
}
