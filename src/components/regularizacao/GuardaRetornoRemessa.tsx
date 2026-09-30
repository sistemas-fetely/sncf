import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { usePermissoesTela } from "@/hooks/usePermissoesTela";

/** Portão das rotas de "Transferências com retorno de remessa" (tela.regularizacao_estoque). */
export function GuardaRetornoRemessa({ children }: { children: ReactNode }) {
  const { podeVer, carregando } = usePermissoesTela("tela.regularizacao_estoque");
  if (carregando) return <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!podeVer) return <p className="p-10 text-center text-sm text-muted-foreground">Você não tem acesso a Transferências com retorno de remessa.</p>;
  return <>{children}</>;
}
