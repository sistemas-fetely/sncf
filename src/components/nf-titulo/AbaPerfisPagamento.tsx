import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { formatCNPJ } from "@/lib/cnpj";
import { formatError } from "@/lib/format-error";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { entraNoFiltroPerfil, podeConfirmarSugestao, rotuloPerfil, textoResultadoPerfil, type ResultadoSalvo } from "./perfilPagamento";
import { useDefinirPerfil, useFormas, usePainelPerfis } from "./usePerfilPagamento";
import { PerfilPagamentoDialog, type AlvoPerfil } from "./PerfilPagamentoDialog";
import { BotaoPermitido } from "./BotaoPermitido";

export function AbaPerfisPagamento() {
  const { data = [], isLoading, error } = usePainelPerfis();
  const { permitido } = usePermissaoAcaoOuSuperAdmin("acao.nf_gerar_titulo");
  const { nome, naoGera } = useFormas();
  const [filtro, setFiltro] = useState<"sem" | "com" | "todos">("sem");
  const [busca, setBusca] = useState("");
  const [alvo, setAlvo] = useState<AlvoPerfil | null>(null);
  const [salvos, setSalvos] = useState<Map<string, ResultadoSalvo>>(new Map());
  const marcarSalvo = (id: string, r: ResultadoSalvo) => setSalvos((m) => new Map(m).set(id, r));
  const confirmar = useDefinirPerfil(marcarSalvo);
  const trocarFiltro = (f: "sem" | "com" | "todos") => { setFiltro(f); setSalvos(new Map()); };
  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase(); const qd = q.replace(/\D/g, "");
    return data.filter((l) => entraNoFiltroPerfil(l, filtro, new Set(salvos.keys())) && (!q || (l.fornecedor ?? "").toLowerCase().includes(q) || (!!qd && (l.cnpj ?? "").includes(qd))))
      .sort((a, b) => Number(b.valor ?? 0) - Number(a.valor ?? 0));
  }, [data, filtro, busca, salvos]);

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex gap-1.5">{([["sem", "Sem perfil"], ["com", "Com perfil"], ["todos", "Todos"]] as const).map(([v, r]) => <Button key={v} size="sm" className="h-8" variant={filtro === v ? "default" : "outline"} onClick={() => trocarFiltro(v)}>{r}</Button>)}</div>
      <div className="relative flex-1 min-w-[220px] max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input className="pl-9 h-8" placeholder="Buscar por nome ou CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
    </div>
    <p className="text-xs text-muted-foreground">O perfil vale para notas emitidas a partir de 12/11/2026. Notas anteriores não ganham título automático.</p>
    {error && <p className="text-sm text-destructive">{formatError(error)}</p>}
    <div className="rounded-md border bg-card">
      <Table className="table-fixed w-full [&_td]:px-2 [&_th]:px-2">
        <TableHeader><TableRow>
          <TableHead className="w-[24%]">Fornecedor</TableHead><TableHead className="w-[8%] text-right">Notas</TableHead><TableHead className="w-[11%] text-right">Valor</TableHead>
          <TableHead className="w-[10%]">Última nota</TableHead><TableHead className="w-[14%]">Perfil atual</TableHead><TableHead className="w-[17%]">Sugestão</TableHead><TableHead className="w-[16%] text-right">Ação</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={7} className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            : !linhas.length ? <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Nenhum fornecedor encontrado.</TableCell></TableRow>
              : linhas.map((l) => {
                const fornecedor = l.fornecedor ?? "—";
                const salvo = salvos.get(l.parceiro_id);
                const pode = !salvo && podeConfirmarSugestao(l.sug_forma_codigo, l.sug_prazo_dias, naoGera);
                return <TableRow key={l.parceiro_id}>
                  <TableCell><p className="truncate text-sm" title={fornecedor}>{fornecedor}</p>{l.cnpj && <p className="text-xs text-muted-foreground font-mono">{formatCNPJ(l.cnpj)}</p>}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.notas ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">{formatBRL(l.valor)}</TableCell>
                  <TableCell className="text-xs">{formatDateBR(l.ultima_nota)}</TableCell>
                  <TableCell className="text-xs"><p>{l.tem_perfil ? rotuloPerfil(l.perfil_forma_nome, l.perfil_prazo_dias, !(l.perfil_forma_codigo && naoGera(l.perfil_forma_codigo))) : "—"}</p>
                    {salvo && <><Badge variant="outline" className="mt-1 font-normal text-[11px] bg-success/10 text-success border-success/20">Salvo agora</Badge><p className="mt-1 text-[11px] text-muted-foreground break-words">{textoResultadoPerfil(salvo, formatBRL)}</p></>}</TableCell>
                  <TableCell className="text-xs"><p>{rotuloPerfil(nome(l.sug_forma_codigo), l.sug_prazo_dias, !(l.sug_forma_codigo && naoGera(l.sug_forma_codigo)))}</p>{l.sug_base && <p className="text-[11px] text-muted-foreground break-words">{l.sug_base}</p>}</TableCell>
                  <TableCell className="text-right"><div className="flex flex-wrap justify-end gap-1">
                    {pode && <BotaoPermitido permitido={permitido} size="sm" className="h-7" disabled={confirmar.isPending} onClick={() => confirmar.mutate({ parceiro_id: l.parceiro_id, forma: l.sug_forma_codigo as string, prazo: naoGera(l.sug_forma_codigo as string) ? null : l.sug_prazo_dias })}>Confirmar sugestão</BotaoPermitido>}
                    <BotaoPermitido permitido={permitido} size="sm" variant="outline" className="h-7" onClick={() => setAlvo({ parceiro_id: l.parceiro_id, fornecedor, forma: l.perfil_forma_codigo ?? l.sug_forma_codigo, prazo: l.perfil_prazo_dias ?? l.sug_prazo_dias, base: l.sug_base })}>{l.tem_perfil || salvo ? "Alterar" : "Definir"}</BotaoPermitido>
                  </div></TableCell>
                </TableRow>;
              })}
        </TableBody>
      </Table>
    </div>
    <PerfilPagamentoDialog alvo={alvo} onClose={() => setAlvo(null)} onSalvo={marcarSalvo} />
  </div>;
}
