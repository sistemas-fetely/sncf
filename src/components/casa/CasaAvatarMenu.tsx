import { UserCircle, Shield, User, LogOut, KeyRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { CASA_APPS } from "./CasaApps";

export function CasaAvatarMenu() {
  const navigate = useNavigate();
  const { profile, hasAnyRole } = useAuth();

  const canSeeMesa = hasAnyRole(["super_admin", "admin_rh"]);
  const mesaApp = CASA_APPS.find((a) => a.id === "mesa");

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-gold"
          aria-label="Menu da conta"
        >
          <UserCircle className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium">{profile?.full_name ?? "Conta"}</div>
          {profile?.position && (
            <div className="text-xs text-muted-foreground mt-0.5">{profile.position}</div>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/meus-dados")}>
          <User className="h-4 w-4 mr-2" /> Meus dados
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/meus-acessos")}>
          <KeyRound className="h-4 w-4 mr-2" /> Meus acessos
        </DropdownMenuItem>
        {canSeeMesa && mesaApp && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate(mesaApp.defaultRoute)}>
              <Shield className="h-4 w-4 mr-2" /> Mesa (admin)
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-2" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
