import { ArrowLeft } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface Props {
  /** Rota de fallback se não houver state.from */
  fallback?: string;
  /** Label de fallback se não houver fromLabel */
  fallbackLabel?: string;
  className?: string;
}

/**
 * Botão "Voltar" inteligente: respeita o `state.from` passado pelo navigate
 * de origem. Cai no fallback se navegou direto pela URL.
 *
 * Uso na origem:
 *   navigate('/destino', { state: { from: '/origem', fromLabel: 'Minhas Tarefas' } })
 */
export function SmartBackButton({
  fallback = "/sncf",
  fallbackLabel = "Voltar",
  className = "",
}: Props) {
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: string; fromLabel?: string } | null)?.from;
  const fromLabel = (location.state as { from?: string; fromLabel?: string } | null)?.fromLabel;

  const label = fromLabel || fallbackLabel;

  const handleBack = () => {
    if (from) {
      navigate(from);
    } else if (location.key !== "default") {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleBack}
      className={`gap-2 text-muted-foreground hover:text-foreground ${className}`}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Button>
  );

}
