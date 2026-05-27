import { Suspense, useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TISidebar } from "@/components/TISidebar";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { useTrackPageVisit } from "@/hooks/useTrackPageVisit";
import { usePrefetchTelas } from "@/hooks/usePrefetchTelas";
import { CommandPaletteProvider } from "@/components/navegacao/CommandPaletteProvider";


export default function TILayout() {
  const { user, roles } = useAuth();
  const [checking, setChecking] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  useTrackPageVisit();
  usePrefetchTelas();

  useEffect(() => {
    if (!user) {
      setChecking(false);
      return;
    }

    if (roles.includes("super_admin") || roles.includes("admin_rh")) {
      setHasAccess(true);
      setChecking(false);
      return;
    }

    const check = async () => {
      const { data } = await supabase
        .from("sncf_user_systems")
        .select("ativo, sncf_sistemas!inner(slug)")
        .eq("user_id", user.id)
        .eq("ativo", true);

      const has = !!data?.some(
        (row: { sncf_sistemas: { slug: string } | { slug: string }[] }) => {
          const sis = row.sncf_sistemas;
          if (Array.isArray(sis)) return sis.some((s) => s.slug === "ti");
          return sis?.slug === "ti";
        }
      );
      setHasAccess(has);
      setChecking(false);
    };
    void check();
  }, [user, roles]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasAccess) {
    return <Navigate to="/sem-permissao" replace />;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <TISidebar />
        <div className="flex-1 flex flex-col">

          <main className="flex-1 p-6 overflow-auto bg-background relative">
            <Suspense fallback={
              <div className="flex items-center justify-center h-full p-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              </div>
            }>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
      <CommandPaletteProvider />
    </SidebarProvider>
  );
}
