import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PackageSearch, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import { usePermissoesTela } from "@/hooks/usePermissoesTela";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabelaFetely } from "@/components/ui/tabela-fetely";
import { RodapePaginacao, lerTamanhoPaginaSalvo, type PageSizeOption } from "@/components/tabela/RodapePaginacao";
import { Selo } from "@/components/ui/selo";
import { NovoLoteDialog } from "@/components/regularizacao/NovoLoteDialog";
import { RegularizacaoStatus } from "@/components/regularizacao/RegularizacaoStatus";
import type { RegularizacaoLote } from "@/components/regularizacao/types";

export default function RegularizacaoLotes() {
  const navigate = useNavigate(); const { podeEditar } = usePermissoesTela("tela.regularizacao_estoque");
  const [novoAberto, setNovoAberto] = useState(false); const [busca, setBusca] = useState(""); const [pagina, setPagina] = useState(1); const [tamanhoPagina, setTamanhoPagina] = useState<PageSizeOption>(() => lerTamanhoPaginaSalvo());
  const lotesQ = useQuery({ queryKey: ["regularizacao", "lotes"], refetchInterval: 30_000, queryFn: async () => { const { data, error } = await supabase.from("vw_regularizacao_lote").select("*").order("criado_em", { ascending: false }); if (error) throw error; return (data ?? []).filter((r) => r.id) as RegularizacaoLote[]; } });
  const lotes = lotesQ.data ?? [];
  const filtrados = useMemo(() => { const termo = busca.trim().toLocaleLowerCase("pt-BR"); return termo ? lotes.filter((l) => `${l.codigo} ${l.titulo} ${l.centro_destino_rotulo}`.toLocaleLowerCase("pt-BR").includes(termo)) : lotes; }, [lotes, busca]);
  const paginaAtual = Math.min(pagina, Math.max(1, Math.ceil(filtrados.length / tamanhoPagina))); const exibidos = filtrados.slice((paginaAtual - 1) * tamanhoPagina, paginaAtual * tamanhoPagina);
  return <PageShell variant="dados" className="animate-casa-fade-in"><PageHeader titulo="Regularização de Estoque" icone={PackageSearch} breadcrumb={[{ label: "Produto" }, { label: "Estoque" }, { label: "Regularização" }]} estado="Lotes de inventário e regularização fiscal do estoque" acoes={podeEditar ? <Button onClick={() => setNovoAberto(true)}><Plus className="mr-2 h-4 w-4" />Novo lote</Button> : undefined} />
    <TabelaFetely busca={{ valor: busca, aoMudar: (v) => { setBusca(v); setPagina(1); }, placeholder: "Buscar lote, título ou centro…" }} carregando={lotesQ.isLoading} erro={lotesQ.isError ? formatError(lotesQ.error) : null} aoTentarNovamente={() => void lotesQ.refetch()} total={lotes.length} exibidos={filtrados.length} rotulo="lotes" vazio={{ mensagem: "Nenhum lote de regularização criado." }}>
      <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Título</TableHead><TableHead>Centro</TableHead><TableHead>Status</TableHead><TableHead>Inventário</TableHead><TableHead>Retornos</TableHead><TableHead className="text-right">Valor do retorno</TableHead><TableHead>TRS</TableHead><TableHead>NF 6152</TableHead></TableRow></TableHeader><TableBody>{exibidos.map((l) => <TableRow key={l.id} className="cursor-pointer" onClick={() => navigate(`/estoque/regularizacao/${l.id}`)}><TableCell className="font-mono text-xs">{l.codigo}</TableCell><TableCell><div className="font-medium">{l.titulo}</div><div className="text-xs text-muted-foreground">{formatDateBR(l.data_inventario)}</div></TableCell><TableCell>{l.centro_destino_rotulo}</TableCell><TableCell><RegularizacaoStatus status={l.status} /></TableCell><TableCell><div>{l.pecas_inventario.toLocaleString("pt-BR")} peças</div><div className="text-xs text-muted-foreground">{l.pecas_cobertas.toLocaleString("pt-BR")} de {l.pecas_inventario.toLocaleString("pt-BR")} cobertas</div></TableCell><TableCell><div>{l.nfs_autorizadas} / {l.nfs_retorno}</div>{l.nfs_erro > 0 && <Selo estado="destructive">{l.nfs_erro} com erro</Selo>}</TableCell><TableCell className="text-right tabular-nums">{formatBRL(l.valor_retorno)}</TableCell><TableCell>{l.trs_numero ? <><div>{l.trs_numero}</div><div className="text-xs text-muted-foreground">{l.trs_estagio ?? "—"}</div></> : "—"}</TableCell><TableCell>{l.nf_6152_numero ?? "—"}</TableCell></TableRow>)}</TableBody></Table><RodapePaginacao total={filtrados.length} pagina={paginaAtual} tamanhoPagina={tamanhoPagina} tela="tela.regularizacao_estoque" onPagina={setPagina} onTamanhoPagina={(n) => setTamanhoPagina(n as PageSizeOption)} /></div>
    </TabelaFetely>{podeEditar && <NovoLoteDialog aberto={novoAberto} onOpenChange={setNovoAberto} />}</PageShell>;
}
