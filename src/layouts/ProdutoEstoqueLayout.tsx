import { Outlet } from "react-router-dom";

/**
 * Casca das telas de Estoque. A barra de abas (Estoque Geral / Saúde / Entradas /
 * Nomes no Bling) foi aposentada em 25/09/2026 — cada tela tem item próprio no
 * menu lateral (sncf_navegacao). As rotas filhas continuam aqui.
 */
export default function ProdutoEstoqueLayout() {
  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
