import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissoesDoUsuario } from "@/hooks/usePermissoesDoUsuario";
import { AcessoBloqueado } from "@/components/AcessoBloqueado";

const SLUG_PARA_ROTA: Record<string, string> = {
  "tela.credito":       "/credito",
  "tela.pedidos":       "/pedidos",
  "tela.financeiro":    "/administrativo",
  "tela.admin_fetely":  "/administrativo-fetely",
  "tela.sncf":          "/sncf",
  "tela.tarefas":       "/tarefas",
  "tela.processos":     "/processos",
  "tela.fala_fetely":   "/fala-fetely",
  "tela.documentacao":  "/documentacao",
  "tela.compras":       "/compras",
  "tela.ti":            "/ti",
};

export default function SemPermissao() {
  const navigate = useNavigate();
  const { roles } = useAuth();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const { data: permitidas } = usePermissoesDoUsuario();

  const handleVoltar = () => {
    if (isSuperAdmin) { navigate("/"); return; }
    if (permitidas) {
      for (const [slug, rota] of Object.entries(SLUG_PARA_ROTA)) {
        if (permitidas.has(slug)) { navigate(rota); return; }
      }
    }
    navigate("/");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <AcessoBloqueado
        tipo="sem-permissao"
        onVoltar={handleVoltar}
      />
    </div>
  );
}
