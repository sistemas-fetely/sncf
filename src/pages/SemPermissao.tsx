import { useNavigate } from "react-router-dom";
import { AcessoBloqueado } from "@/components/AcessoBloqueado";

export default function SemPermissao() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <AcessoBloqueado
        tipo="sem-permissao"
        onVoltar={() => navigate("/")}
      />
    </div>
  );
}
