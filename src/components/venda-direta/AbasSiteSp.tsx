import { Link, useLocation } from "react-router-dom";
import { AbaPermitida } from "@/components/AbaGate";
import { cn } from "@/lib/utils";

export function AbasSiteSp() {
  const { pathname, search } = useLocation();
  const estoque = new URLSearchParams(search).get("aba") === "estoque-site-sp";
  const novo = pathname.endsWith("/novo") || pathname.endsWith("/editar");
  const classe = (ativo: boolean) => cn("border-b-2 px-3 py-2 text-sm", ativo ? "border-primary font-medium" : "border-transparent text-muted-foreground");
  return (
    <nav aria-label="Pedidos Site SP" className="flex flex-wrap border-b">
      <AbaPermitida slug="tela.venda_direta_novo"><Link className={classe(novo)} to="/pedidos/venda-direta/novo">Novo pedido</Link></AbaPermitida>
      <AbaPermitida slug="tela.venda_direta_gestao"><Link className={classe(!novo && !estoque)} to="/pedidos/venda-direta">Gestão</Link>
        <Link className={classe(!novo && estoque)} to="/pedidos/venda-direta?aba=estoque-site-sp">Estoque Site SP</Link></AbaPermitida>
    </nav>
  );
}