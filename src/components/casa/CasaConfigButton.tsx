import { Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function CasaConfigButton() {
  const navigate = useNavigate();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => navigate("/admin")}
      className="h-9 w-9 text-gold hover:text-gold-light hover:bg-gold/10"
      aria-label="Configurações"
    >
      <Settings className="h-4 w-4" />
    </Button>
  );
}
