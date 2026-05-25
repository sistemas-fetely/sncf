import { Suspense } from "react";
import { Outlet } from "react-router-dom";

/**
 * Layout invisível para rotas públicas (Login, RecuperarSenha, VagaPublica, NotFound, etc.).
 *
 * Objetivo: prover boundary de Suspense localizada para chunks lazy das rotas
 * públicas, sem precisar de um <Suspense> raiz envolvendo <Routes> inteiro
 * (que causava o soluço de navegação — R-01).
 *
 * Sem visual; renderiza apenas o <Outlet>.
 */
export default function PublicLayout() {
  return (
    <Suspense fallback={null}>
      <Outlet />
    </Suspense>
  );
}
