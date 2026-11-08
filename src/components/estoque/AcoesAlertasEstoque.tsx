import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cargaParadosXpm, urlDevolucoesProduto, type AlertaProduto } from "@/lib/estoque/filaOperacionalEstoque";

export function AcoesAlertasEstoque({ card, alertas }: { card: string; alertas: AlertaProduto[] }) {
  const navigate = useNavigate();
  if (card === "parado_xpm") {
    const carga = cargaParadosXpm(alertas);
    return <Button size="sm" variant="outline" disabled={!carga} onClick={() => { if (carga) navigate("/pedidos/transferencias?aba=nova", { state: { reposicaoSp: carga } }); }}><ArrowRight className="h-4 w-4 mr-2" />Trazer tudo para SP</Button>;
  }
  const produtos = alertas.filter(a => a.devolucao_alta && a.sku);
  if (card !== "devolucao_alta" || !produtos.length) return null;
  if (produtos.length === 1) return <Button asChild size="sm" variant="outline"><Link to={urlDevolucoesProduto(produtos[0].sku ?? "")}><Undo2 className="h-4 w-4 mr-2" />Ver devoluções</Link></Button>;
  return <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant="outline"><Undo2 className="h-4 w-4 mr-2" />Ver devoluções</Button></DropdownMenuTrigger>
    <DropdownMenuContent className="max-h-80 overflow-y-auto">{produtos.map(a => <DropdownMenuItem key={a.sku} asChild><Link to={urlDevolucoesProduto(a.sku ?? "")}>{a.cod_cadastro ?? a.sku} · {a.nome_comercial}</Link></DropdownMenuItem>)}</DropdownMenuContent>
  </DropdownMenu>;
}